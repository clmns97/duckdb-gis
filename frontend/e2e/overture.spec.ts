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

// Uses one small building: a country-sized pick (zoom 5, Germany) is correct
// but takes ~2 min over S3, which is a data-volume cost, not a regression.
test("Create Layer from Selection copies the picked feature into an editable table @network", async ({ app, page }) => {
  await page.evaluate(
    (r) => window.gisOverture.addOvertureLayers({ themes: ["buildings"], release: r }),
    await liveRelease(app),
  );
  await app.layersSettled();
  const layer = (await app.layers()).find((l) => l.kind === "pmtiles")!;
  await app.jump(8.682, 50.1105, 17); // Frankfurt Römerberg, dense small buildings
  await page.waitForTimeout(3000); // tiles over the network
  // a pixel that has a building under it
  const p = await page.evaluate(() => {
    const map = window.gisMap();
    const ids = map.getStyle().layers.filter((x: { id: string; type: string }) => x.id.startsWith("L_ovt_") && x.type === "fill").map((x: { id: string }) => x.id);
    const { width, height } = map.getContainer().getBoundingClientRect();
    for (let r = 0; r < 200; r += 10)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const pt: [number, number] = [width / 2 + dx, height / 2 + dy];
        if (map.queryRenderedFeatures(pt, { layers: ids }).length) {
          const box = map.getContainer().getBoundingClientRect();
          return { x: box.left + pt[0], y: box.top + pt[1] };
        }
      }
    return null;
  });
  expect(p, "a rendered building near the map centre").not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await expect.poll(() => page.evaluate(() => window.gisPmSelection.size)).toBeGreaterThan(0);
  const picked: number = await page.evaluate(() => window.gisPmSelection.size);

  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: `Actions for ${layer.name}` }).click();
  await app.menuItem(/Create Layer from Selection/).click();
  await expect
    .poll(async () => (await app.layers()).find((l) => /^Buildings_selection_/.test(l.name)), { timeout: 45_000 })
    .toBeTruthy();
  await app.layersSettled();
  const copy = (await app.layers()).find((l) => /^Buildings_selection_/.test(l.name))!;
  expect(copy).toMatchObject({ kind: "table", status: "ready" });
  const [{ n }] = await app.sql(`SELECT count(*)::INT AS n FROM memory.main."${copy.name}"`);
  expect(n).toBe(picked);
});
