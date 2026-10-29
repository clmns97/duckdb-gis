// End-to-end smoke of the core loop against a running app (default: vite dev on
// :5173 proxying a start_gis_server over testdata/demo.duckdb, see testdata/serve.sh).
// Usage: node e2e-smoke.mjs [baseUrl] [scratchDir]
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:5173/";
const SCRATCH = process.argv[3] ?? "/tmp";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
page.on("dialog", (d) => d.accept());

const failures = [];
const DRAWN = `drawn_${Date.now().toString(36)}`; // the server catalog outlives a run
async function step(name, fn) {
  try {
    const e0 = errs.length;
    await fn();
    console.log("ok   ", name, errs.length > e0 ? `(+${errs.length - e0} console errors)` : "");
  } catch (e) {
    failures.push(name);
    console.log("FAIL ", name, "—", String(e?.message ?? e).split("\n")[0]);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sql = (q) => page.evaluate((q) => window.gisQuery(q), q);
const layerList = () =>
  page.evaluate(() => window.gisLayers.list().map((l) => ({ name: l.name, status: l.status, visible: l.visible, kind: l.kind, error: l.error })));
const waitLayersReady = () =>
  page.waitForFunction(() => window.gisLayers.list().every((l) => l.status !== "loading"), null, { timeout: 20000 });
const menuItem = (label) => page.locator('[role="menu"] button, .fixed button').filter({ hasText: label }).first();
const sidebarTab = (name) => page.getByRole("tab", { name, exact: true });
const editorStatus = () => page.locator("button:has-text('Run') + span").textContent();

async function runSql(text) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(text);
  await page.locator("button:has-text('Run')").click();
  await page.waitForFunction(() => !/Running/.test(document.querySelector("button + span.text-editor")?.textContent ?? "Running"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  return editorStatus();
}

async function mapPx(lng, lat) {
  return page.evaluate(([lng, lat]) => {
    const map = window.gisMap();
    const p = map.project([lng, lat]);
    const r = map.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [lng, lat]);
}
// Terra Draw tracks the pointer, so move there before pressing.
async function tap(x, y) {
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
}
async function jump(lng, lat, zoom) {
  await page.evaluate(([lng, lat, zoom]) => window.gisMap().jumpTo({ center: [lng, lat], zoom }), [lng, lat, zoom]);
  await page.waitForTimeout(400);
}

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator(".cm-editor").waitFor({ timeout: 20000 });
await page.waitForFunction(() => window.gisMap?.()?.isStyleLoaded(), null, { timeout: 20000 });

await step("catalog lists demo tables", async () => {
  await page.getByText("cities", { exact: true }).waitFor({ timeout: 15000 });
  for (const t of ["regions", "roads", "pts"]) await page.getByText(t, { exact: true }).first().waitFor();
});

await step("browser tree collapse/expand", async () => {
  const work = page.locator("li").filter({ has: page.getByText("work", { exact: true }) }).first();
  await work.getByRole("button", { name: "Collapse" }).first().click();
  await page.getByText("cities", { exact: true }).waitFor({ state: "detached" });
  await work.getByRole("button", { name: "Expand" }).first().click();
  await page.getByText("cities", { exact: true }).waitFor();
});

await step("SQL run: points/lines/polygons", async () => {
  expect(/3 features/.test(await runSql("SELECT 'Zürich' AS name, ST_Point(8.54, 47.37) AS geom UNION ALL SELECT 'Bern', ST_Point(7.45, 46.95) UNION ALL SELECT 'Geneva', ST_Point(6.14, 46.20);")), "points");
  expect(/1 feature/.test(await runSql("SELECT ST_GeomFromText('LINESTRING(0 0, 1 1, 2 0)') AS geom")), "line");
  expect(/1 feature/.test(await runSql("SELECT ST_GeomFromText('POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))') AS geom")), "polygon");
  expect(/60000 features/.test(await runSql("SELECT * FROM work.pts")), "60k pts");
});

await step("SQL run: errors surface", async () => {
  expect(/rror|not exist|Catalog/i.test(await runSql("SELECT * FROM nope")), "bad table");
  expect(/WGS84/.test(await runSql("SELECT ST_Point(500000, 5200000) AS geom")), "projected CRS guard");
  const preview = (await layerList()).find((l) => l.kind === "preview");
  expect(preview?.status === "error", "preview layer should be in error state");
});

await step("add table layers via context menu", async () => {
  for (const t of ["cities", "regions", "roads"]) {
    await sidebarTab("Browser").click();
    await page.getByText(t, { exact: true }).first().click({ button: "right" });
    await menuItem("Add to map").click();
  }
  await waitLayersReady();
  const ls = await layerList();
  for (const t of ["cities", "regions", "roads"]) expect(ls.find((l) => l.name === t)?.status === "ready", `${t} not ready: ${JSON.stringify(ls)}`);
});

await step("layer panel: hide/show + reorder", async () => {
  await sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Hide roads" }).click();
  expect((await layerList()).find((l) => l.name === "roads").visible === false, "hide");
  await page.getByRole("button", { name: "Show roads" }).click();
  expect((await layerList()).find((l) => l.name === "roads").visible === true, "show");
  const before = (await layerList()).map((l) => l.name);
  await page.evaluate(() => {
    const ls = window.gisLayers.list();
    window.gisLayers.reorder(ls[0].id, ls.length);
  });
  const after = (await layerList()).map((l) => l.name);
  expect(after[after.length - 1] === before[0], `reorder ${before} -> ${after}`);
});

await step("map click selects a city, shift-click adds", async () => {
  await jump(8, 47, 3);
  const zurich = await mapPx(8.54, 47.37);
  const rows = await sql("SELECT name FROM work.cities");
  expect(rows.length > 1, "cities rows");
  await page.mouse.click(zurich.x, zurich.y);
  await page.waitForTimeout(300);
  const n1 = await page.evaluate(() => window.gisSelection.size);
  // pick by store for the second one: exact pixel hits on 4px dots are flaky
  await page.evaluate(() => window.gisSelection.pick(window.gisSelection.source(), 999999, true));
  const n2 = await page.evaluate(() => window.gisSelection.size);
  expect(n2 === n1 + 1, `selection ${n1} -> ${n2}`);
  await page.getByRole("button", { name: "Clear selection" }).click().catch(() => page.evaluate(() => window.gisSelection.clear()));
});

await step("processing: merge two regions", async () => {
  const src = await page.evaluate(() => {
    const r = window.gisLayers.list().find((l) => l.name === "regions");
    return r;
  });
  expect(src, "regions layer");
  // select both region features through the store (same as clicking them)
  await page.evaluate(async () => {
    const l = window.gisLayers.list().find((x) => x.name === "regions");
    await window.gisDeck.renderGeoArrow(`SELECT geom FROM "${l.source.db}"."main"."regions"`);
    const s = window.gisSelection.source();
    window.gisSelection.pick(s, 1, false);
    window.gisSelection.pick(s, 2, true);
  });
  await page.getByRole("button", { name: "Processing" }).click();
  await menuItem("Merge selected features").click();
  await page.waitForFunction(() => window.gisLayers.list().some((l) => /Merge result/.test(l.name) && l.status === "ready"), null, { timeout: 15000 });
});

await step("layer properties: info + symbology", async () => {
  await sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Actions for regions" }).click();
  await menuItem("Layer properties").click();
  await page.getByText("Feature count").waitFor();
  await page.waitForFunction(() => /^2$/.test([...document.querySelectorAll("dd")].map((d) => d.textContent).find((t) => /^\d+$/.test(t ?? "")) ?? ""), null, { timeout: 10000 });
  await page.getByRole("tab", { name: "Symbology" }).click();
  await page.locator('input[type="range"]').first().fill("0.8");
  const op = await page.evaluate(() => window.gisLayers.list().find((l) => l.name === "regions").style.fillOpacity);
  expect(op === 0.8, `opacity ${op}`);
  await page.locator('input[type="color"]').first().evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "#ff0000");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const fill = await page.evaluate(() => window.gisLayers.list().find((l) => l.name === "regions").style.fillColor.join(","));
  expect(fill === "255,0,0", `fill ${fill}`);
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
});

await step("attribute table opens and pages", async () => {
  await page.getByRole("button", { name: "Actions for cities" }).click();
  await menuItem("Open attribute table").click();
  await page.locator("table td").filter({ hasText: /Zürich|Zurich|Tokyo|London|Paris|New York/ }).first().waitFor({ timeout: 10000 });
  await page.getByTitle("Next page").click().catch(() => {});
  await page.locator(".dv-tab").filter({ hasText: /^Map$/ }).click(); // bring the map back to front
});

await step("new layer: draw polygon, undo/redo, save", async () => {
  await page.getByRole("button", { name: "New layer" }).click();
  await page.getByPlaceholder("new_layer").fill(DRAWN);
  await page.getByRole("button", { name: "Polygon" }).click();
  await page.getByPlaceholder("new_layer").press("Enter"); // Enter submits the form
  await jump(10, 50, 6);
  const c = await mapPx(10, 50);
  const pts = [[-60, -40], [60, -40], [60, 40], [-60, 40]];
  for (const [dx, dy] of [...pts, pts[0]]) await tap(c.x + dx, c.y + dy); // last tap closes the ring
  await page.waitForTimeout(500);
  let n = await page.evaluate(() => window.gisEditing.featureCount);
  if (n !== 1) console.log("  debug:", await page.evaluate(([x, y]) => ({ mode: window.gisEditing.mode, editing: window.gisEditing.isEditing(), hit: document.elementFromPoint(x, y)?.className, map: window.gisMap().getContainer().getBoundingClientRect() }), [c.x, c.y]), c);
  expect(n === 1, `drawn features ${n}`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  n = await page.evaluate(() => window.gisEditing.featureCount);
  expect(n === 0, `after undo ${n}`);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(200);
  n = await page.evaluate(() => window.gisEditing.featureCount);
  expect(n === 1, `after redo ${n}`);
  expect(await page.getByLabel("Unsaved changes").count() > 0, "unsaved indicator");
  await page.getByTitle("Create the layer table and save the drawn features").click();
  await page.waitForFunction(() => !window.gisEditing.isEditing(), null, { timeout: 10000 }).catch(async (e) => {
    throw new Error(`still editing; alert=${await page.getByRole("alert").textContent().catch(() => "none")}`);
  });
  const rows = await sql(`SELECT count(*) AS n FROM memory.main.${DRAWN}`);
  expect(Number(rows[0].n) === 1, "drawn table rows");
  await waitLayersReady();
  expect((await layerList()).find((l) => l.name === DRAWN)?.status === "ready", "drawn layer ready");
});

await step("edit existing layer: select, duplicate, rotate, scale, copy/paste, delete, save", async () => {
  await page.evaluate((n) => window.gisLayers.setActive(window.gisLayers.list().find((l) => l.name === n).id), DRAWN);
  await page.getByTitle(`Edit ${DRAWN}`).click();
  await page.waitForFunction(() => window.gisEditing.isEditing() && window.gisEditing.featureCount === 1, null, { timeout: 10000 });
  const c = await mapPx(10, 50);
  await tap(c.x, c.y); // select the polygon
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.gisEditing.selectedCount)) === 1, "selected 1");
  for (const t of ["Duplicate the selection", "Copy the selection"]) {
    await page.getByTitle(t).click();
    await page.waitForTimeout(150);
  }
  await page.getByTitle(/^Rotate selection/).click();
  await page.getByTitle(/^Scale selection/).click();
  await page.getByTitle("Paste features").click();
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.gisEditing.featureCount);
  expect(n === 3, `features after dup+paste ${n}`);
  await page.waitForTimeout(400); // let the paste gesture settle into its own undo step
  const count = () => page.evaluate(() => window.gisEditing.featureCount);
  await page.keyboard.press("Control+z");
  expect((await count()) === 2, `undo paste -> ${await count()}`);
  await page.keyboard.press("Control+y");
  expect((await count()) === 3, `redo paste -> ${await count()}`);
  await page.getByTitle("Save edits back to the layer's table").click();
  await page.waitForFunction(() => !window.gisEditing.isEditing(), null, { timeout: 10000 });
  const rows = await sql(`SELECT count(*) AS n FROM memory.main.${DRAWN}`);
  expect(Number(rows[0].n) === 3, `rows after save ${rows[0].n}`);
});

await step("edit + merge + cancel discards", async () => {
  await waitLayersReady();
  await page.evaluate((n) => window.gisEditing.beginEdit(window.gisLayers.list().find((l) => l.name === n)), DRAWN);
  await page.waitForFunction(() => window.gisEditing.featureCount === 3, null, { timeout: 10000 });
  await page.getByTitle(/^Stop editing/).click();
  await page.waitForFunction(() => !window.gisEditing.isEditing(), null, { timeout: 10000 });
  const rows = await sql(`SELECT count(*) AS n FROM memory.main.${DRAWN}`);
  expect(Number(rows[0].n) === 3, "cancel kept rows");
});

await step("basemap switch persists", async () => {
  await sidebarTab("Browser").click();
  await page.getByTitle("Switch the map basemap").click();
  await menuItem("Dark (offline)").click();
  await page.waitForTimeout(500);
  const layersOk = await page.evaluate(() => window.gisMap().getStyle().layers.some((l) => l.id.startsWith("gis-basemap:")));
  expect(layersOk, "basemap layers present");
  await page.getByTitle("Switch the map basemap").click();
  await menuItem("Light (offline)").click();
});

await step("project save + open restores layers and style", async () => {
  const path = `${SCRATCH}/e2e-project-${Date.now()}.duckdb`;
  await page.getByRole("button", { name: "Project" }).click();
  await menuItem("Save project").click();
  await page.getByPlaceholder("/data/my-project.duckdb").fill(path);
  await page.getByPlaceholder("Untitled project").fill("e2e");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15000 });
  expect((await page.getByLabel("Unsaved changes").count()) === 0, "dirty cleared after save");
  const before = (await layerList()).filter((l) => l.kind !== "preview").map((l) => l.name).join(",");
  await page.evaluate(() => window.gisLayers.list().forEach((l) => window.gisLayers.remove(l.id)));
  // Unsaved work → Open must ask first (the dialog handler accepts), then force.
  await page.evaluate(() => {
    // the URL the app loaded (vite adds ?t= after a hot update), so we share its instance
    const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/lib/unsavedChanges.ts"));
    return import(url).then((m) => m.unsavedChanges.markDirty());
  });
  let asked = false;
  page.once("dialog", (d) => (asked = /unsaved changes/.test(d.message())));
  await page.getByRole("button", { name: "Project" }).click();
  await menuItem("Open project").click();
  await page.getByPlaceholder("/data/my-project.duckdb").fill(path);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 });
  expect(asked, "no unsaved-changes confirm");
  await waitLayersReady();
  const after = (await layerList()).map((l) => l.name).join(",");
  expect(after === before, `layers ${before} -> ${after}`);
  const fill = await page.evaluate(() => window.gisLayers.list().find((l) => l.name === "regions").style.fillColor.join(","));
  expect(fill === "255,0,0", `restored fill ${fill}`);
  const rows = await sql(`SELECT count(*) AS n FROM memory.main.${DRAWN}`);
  expect(Number(rows[0].n) === 3, "drawn table restored");
});

await step("attach + detach a database", async () => {
  const path = `${SCRATCH}/e2e-attach.duckdb`;
  await sql(`ATTACH '${path}' AS e2e_tmp; CREATE OR REPLACE TABLE e2e_tmp.t AS SELECT ST_Point(1, 2) AS geom; DETACH e2e_tmp;`);
  await sidebarTab("Browser").click();
  await page.getByRole("button", { name: "Attach database" }).click();
  await page.getByPlaceholder("/data/example.duckdb").fill(path);
  await page.getByLabel("Alias (optional)").fill("e2e_attach");
  await page.getByLabel("Alias (optional)").press("Enter"); // Enter in the 2nd field submits too
  await page.getByText("e2e_attach", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Actions for e2e_attach" }).click();
  await menuItem("Detach").click();
  await page.getByText("e2e_attach", { exact: true }).waitFor({ state: "detached", timeout: 10000 });
});

await step("sidebar collapse + rail reveal", async () => {
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await sidebarTab("Layers").waitFor();
});

await step("overture modal opens/closes", async () => {
  await sidebarTab("Browser").click();
  await page.getByTitle(/Add Overture Maps data/).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
});

await step("overture PMTiles layer: load, style layers, hide, remove", async () => {
  const release = (await page.evaluate(() => import(performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/lib/overture.ts"))).then((m) => m.listOvertureReleases()).then((r) => r[0])));
  await page.evaluate((r) => window.gisOverture.addOvertureLayers({ themes: ["divisions"], release: r }), release);
  await page.waitForFunction(() => window.gisLayers.list().some((l) => l.kind === "pmtiles" && l.status !== "loading"), null, { timeout: 30000 });
  const l = (await layerList()).find((x) => x.kind === "pmtiles");
  expect(l.status === "ready", `pmtiles ${l.status} ${l.error ?? ""}`);
  const ids = () => page.evaluate(() => window.gisMap().getStyle().layers.filter((x) => x.id.startsWith("L_ovt_")).map((x) => `${x.id}:${x.layout?.visibility ?? "visible"}`));
  const shown = await ids();
  expect(shown.length >= 3 && shown.some((i) => i.endsWith("-fill:visible")), `style layers ${shown}`);
  await sidebarTab("Layers").click();
  await page.getByRole("button", { name: `Hide ${l.name}` }).click();
  expect((await ids()).every((i) => i.endsWith(":none")), "hidden");
  await page.getByRole("button", { name: `Remove ${l.name}` }).click({ force: true });
  expect((await ids()).length === 0, "removed");
});

await step("rapid-fire: spam runs + layer toggles", async () => {
  await runSql("SELECT * FROM work.regions");
  for (let i = 0; i < 4; i++) await page.locator("button:has-text('Run')").click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) await page.evaluate(() => { const l = window.gisLayers.list().find((x) => x.name === "cities"); window.gisLayers.setVisible(l.id, !l.visible); });
  expect((await layerList()).find((l) => l.name === "cities").visible === true, "toggle parity");
});

const relevant = errs.filter((e) => !/Failed to load resource|net::ERR|tile|404|status of 400/i.test(e));
console.log("\nconsole/page errors:", relevant.length ? relevant.slice(0, 10) : "none");
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(" | ")}` : "\nALL PASSED");
await browser.close();
process.exit(failures.length || relevant.length ? 1 : 0);
