import { test, expect, type App } from "./fixtures";

// Overture data is remote (public S3 + hosted PMTiles). Tests tagged @network
// need internet access and are skipped in CI (`--grep-invert @network`).

const liveRelease = (app: App) =>
  app.withModule("/src/lib/overture.ts", (m) => m.listOvertureReleases().then((r: string[]) => r[0]));

test("a release-listing failure is shown and Load stays disabled", async ({ app, page }) => {
  await page.route(/list-type=2/, (r) => r.abort()); // the tiles bucket listing
  await page.getByTitle(/Add Overture Maps data/).click();
  await page.getByLabel("Divisions").check();
  await expect(page.getByText(/Couldn't list Overture releases/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Load", exact: true })).toBeDisabled();
  void app;
});

test("the dialog loads a theme as a PMTiles layer @network", async ({ app, page }) => {
  await page.getByTitle(/Add Overture Maps data/).click();
  await expect(page.getByRole("button", { name: "Load", exact: true })).toBeDisabled(); // no theme yet
  await expect(page.getByRole("dialog").locator("select")).toHaveValue(await liveRelease(app), {
    timeout: 30_000,
  });
  await page.getByLabel("Divisions").check();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await app.layersSettled();
  expect((await app.layers()).find((l) => l.kind === "pmtiles")?.status).toBe("ready");
});

test("a PMTiles layer selects, hides, round-trips a project and removes @network", async ({ app, page }, info) => {
  const release = await liveRelease(app);
  await page.evaluate((r) => window.gisOverture.addOvertureLayers({ themes: ["divisions"], release: r }), release);
  await app.layersSettled();
  const layer = (await app.layers()).find((l) => l.kind === "pmtiles")!;
  expect(layer.status).toBe("ready");
  const styleLayers = (): Promise<string[]> =>
    page.evaluate(() =>
      window
        .gisMap()
        .getStyle()
        .layers.filter((x: { id: string }) => x.id.startsWith("L_ovt_"))
        .map((x: { id: string; layout?: { visibility?: string } }) => `${x.id}:${x.layout?.visibility ?? "visible"}`),
    );
  expect((await styleLayers()).some((i) => i.endsWith("-fill:visible"))).toBe(true);

  // clicking a division polygon selects it, with a bbox around the click
  await app.jump(10.4, 51.1, 5);
  await page.waitForTimeout(2500); // tiles over the network
  const p = await app.mapPx(10.4, 51.1);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.gisPmSelection.size)).toBeGreaterThan(0);
  const b = await page.evaluate(() => window.gisPmSelection.bounds());
  expect(b.xmin <= 10.4 && b.xmax >= 10.4 && b.ymin <= 51.1 && b.ymax >= 51.1).toBe(true);

  // project round-trip
  const path = info.outputPath("pm.duckdb");
  await page.getByRole("button", { name: "Project" }).click();
  await app.menuItem("Save project").click();
  await page.getByPlaceholder("/data/my-project.duckdb").fill(path);
  await page.getByPlaceholder("/data/my-project.duckdb").press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Project" }).click();
  await app.menuItem("Open project").click();
  await page.getByPlaceholder("/data/my-project.duckdb").fill(path);
  await page.getByPlaceholder("/data/my-project.duckdb").press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await app.layersSettled();
  expect(await app.layer(layer.name)).toMatchObject({ kind: "pmtiles", status: "ready" });

  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: `Hide ${layer.name}` }).click();
  expect((await styleLayers()).every((i) => i.endsWith(":none"))).toBe(true);
  await page.getByRole("button", { name: `Remove ${layer.name}` }).click({ force: true });
  expect(await styleLayers()).toEqual([]);
});
