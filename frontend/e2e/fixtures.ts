import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { tableFromIPC } from "apache-arrow";
import { GIS_PORT } from "../playwright.config";

// The app's DEV-only seam (App.tsx) the suite reads state through.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [k: `gis${string}`]: any;
  }
}

export interface LayerRow {
  id: string;
  name: string;
  kind: string;
  status: string;
  visible: boolean;
  error?: string;
}

// Run SQL on the suite's extension server directly (outside any page).
async function serverSql(request: APIRequestContext, sql: string): Promise<Record<string, unknown>[]> {
  const res = await request.post(`http://localhost:${GIS_PORT}/ddb/run`, {
    headers: { Origin: `http://localhost:${GIS_PORT}` },
    data: sql,
  });
  if (!res.ok()) throw new Error(`${sql}: ${await res.text()}`);
  return tableFromIPC(await res.body()).toArray().map((r) => r.toJSON());
}

// Put the shared server back to its startup state: only the `demo` fixture
// attached. Detaching the working catalog (`memory`) drops everything earlier
// tests created; the app re-creates it on load (lib/workspace.ts).
async function resetServer(request: APIRequestContext): Promise<void> {
  await serverSql(request, "USE demo");
  const dbs = await serverSql(
    request,
    "SELECT database_name AS n FROM duckdb_databases() WHERE NOT internal AND database_name <> 'demo'",
  );
  for (const { n } of dbs) await serverSql(request, `DETACH "${String(n).replace(/"/g, '""')}"`);
}

// Console errors that are expected rather than bugs: failed network fetches
// (basemap tiles, the 400 a deliberately bad query returns).
const EXPECTED_ERRORS = /Failed to load resource|net::ERR|status of 400/i;

/** Page-level helpers over the running app. */
export class App {
  constructor(readonly page: Page) {}

  sql(q: string): Promise<Record<string, unknown>[]> {
    return this.page.evaluate((q) => window.gisQuery(q), q);
  }

  layers(): Promise<LayerRow[]> {
    return this.page.evaluate(() =>
      window.gisLayers.list().map((l: LayerRow) => ({
        id: l.id,
        name: l.name,
        kind: l.kind,
        status: l.status,
        visible: l.visible,
        error: l.error,
      })),
    );
  }

  async layer(name: string): Promise<LayerRow | undefined> {
    return (await this.layers()).find((l) => l.name === name);
  }

  async layersSettled(): Promise<void> {
    await this.page.waitForFunction(
      () => window.gisLayers.list().every((l: LayerRow) => l.status !== "loading"),
      null,
      { timeout: 30_000 },
    );
  }

  /** Add a catalog table as a layer through the store (the UI path has its own test). */
  async addLayer(table: string, db = "demo"): Promise<void> {
    await this.page.evaluate(
      ([db, table]) => window.gisLayers.add({ db, schema: "main", table, geomColumn: "geom" }),
      [db, table],
    );
    await this.layersSettled();
  }

  menuItem(label: string | RegExp) {
    return this.page.getByRole("menuitem").getByRole("button", { name: label }).first();
  }

  sidebarTab(name: "Layers" | "Browser") {
    return this.page.getByRole("tab", { name, exact: true });
  }

  get editorStatus() {
    return this.page.locator("button:has-text('Run') + span");
  }

  /** Replace the SQL editor's text and run it; resolves with the status line. */
  async runSql(text: string): Promise<string> {
    await this.page.locator(".cm-content").click();
    await this.page.keyboard.press("Control+a");
    await this.page.keyboard.press("Delete");
    await this.page.keyboard.insertText(text); // literal: no bracket auto-close
    await this.page.locator("button:has-text('Run')").click();
    await expect(this.editorStatus).not.toHaveText(/Running/, { timeout: 30_000 });
    return (await this.editorStatus.textContent()) ?? "";
  }

  /** Page coordinates of a lon/lat on the map. */
  mapPx(lng: number, lat: number): Promise<{ x: number; y: number }> {
    return this.page.evaluate(
      ([lng, lat]) => {
        const map = window.gisMap();
        const p = map.project([lng, lat]);
        const r = map.getContainer().getBoundingClientRect();
        return { x: r.left + p.x, y: r.top + p.y };
      },
      [lng, lat],
    );
  }

  async jump(lng: number, lat: number, zoom: number): Promise<void> {
    await this.page.evaluate(
      ([lng, lat, zoom]) => window.gisMap().jumpTo({ center: [lng, lat], zoom }),
      [lng, lat, zoom],
    );
    await this.page.waitForTimeout(400);
  }

  /** Click on the map. Terra Draw tracks the pointer, so move there first. */
  async tap(x: number, y: number): Promise<void> {
    await this.page.mouse.move(x, y, { steps: 4 });
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.page.waitForTimeout(150);
  }

  /** Import one of the app's own modules, sharing the instance the app loaded
   *  (Vite adds `?t=` to a module's URL after a hot update). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async withModule<T>(path: string, fn: (m: any) => T): Promise<Awaited<T>> {
    return this.page.evaluate(
      async ([path, fnSrc]) => {
        const url = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .find((n) => n.includes(path));
        const m = await import(url ?? path);
        return new Function("m", `return (${fnSrc})(m)`)(m);
      },
      [path, fn.toString()],
    );
  }
}

/** `app`: a freshly loaded app over a reset server; fails the test on any
 *  unexpected console or page error. */
export const test = base.extend<{ app: App }>({
  app: async ({ page, request }, use) => {
    await resetServer(request);
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && !EXPECTED_ERRORS.test(m.text()) && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("dialog", (d) => void d.accept());
    await page.goto("/");
    await page.locator(".cm-editor").waitFor();
    await page.waitForFunction(() => window.gisMap?.()?.isStyleLoaded(), null, { timeout: 30_000 });
    await page.getByText("cities", { exact: true }).waitFor(); // catalog loaded
    await use(new App(page));
    expect(errors, "unexpected console errors").toEqual([]);
  },
});

export { expect };
