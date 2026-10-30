import { test, expect } from "./fixtures";

test("a table is added from the Browser context menu", async ({ app, page }) => {
  await page.getByText("regions", { exact: true }).click({ button: "right" });
  await app.menuItem("Add to map").click();
  await app.layersSettled();
  expect((await app.layer("regions"))?.status).toBe("ready");
  await app.sidebarTab("Layers").click();
  await expect(page.getByRole("button", { name: "Actions for regions" })).toBeVisible();
});

test("layers hide, show and reorder", async ({ app, page }) => {
  for (const t of ["cities", "regions", "roads"]) await app.addLayer(t);
  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Hide roads" }).click();
  expect((await app.layer("roads"))?.visible).toBe(false);
  await page.getByRole("button", { name: "Show roads" }).click();
  expect((await app.layer("roads"))?.visible).toBe(true);
  const before = (await app.layers()).map((l) => l.name);
  await page.evaluate(() => {
    const ls = window.gisLayers.list();
    window.gisLayers.reorder(ls[0].id, ls.length);
  });
  expect((await app.layers()).map((l) => l.name)).toEqual([...before.slice(1), before[0]]);
});

test("zoom to layer frames a layer on a phone-sized map", async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.addLayer("regions");
  await app.jump(100, -30, 3);
  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Actions for regions" }).click();
  await app.menuItem("Zoom to layer").click();
  await expect
    .poll(() => page.evaluate(() => window.gisMap().getCenter().lng))
    .toBeCloseTo(8.25, 0);
});

test("layer properties show information and edit symbology", async ({ app, page }) => {
  await app.addLayer("regions");
  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Actions for regions" }).click();
  await app.menuItem("Layer properties").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Feature count").locator("+ dd")).toHaveText("2");
  await expect(dialog.getByText("Not declared (assumed EPSG:4326)")).toBeVisible();

  await dialog.getByRole("tab", { name: "Symbology" }).click();
  await dialog.locator('input[type="range"]').first().fill("0.8");
  await dialog.locator('input[type="color"]').first().evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "#ff0000");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const style = await page.evaluate(() => window.gisLayers.list().find((l: { name: string }) => l.name === "regions").style);
  expect(style.fillOpacity).toBe(0.8);
  expect(style.fillColor).toEqual([255, 0, 0]);
});

test("a declared projected CRS shows as reprojected", async ({ app, page }) => {
  await app.sql(`CREATE TABLE memory.main.crs_3857 AS
    SELECT ST_Transform(ST_Point(8.54, 47.37), 'EPSG:4326', 'EPSG:3857', always_xy := true)::GEOMETRY('EPSG:3857') AS geom`);
  await app.addLayer("crs_3857", "memory");
  expect((await app.layer("crs_3857"))?.status).toBe("ready");
  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Actions for crs_3857" }).click();
  await app.menuItem("Layer properties").click();
  await expect(page.getByText("EPSG:3857 (reprojected to WGS84 for display)")).toBeVisible();
});

test("the attribute table opens and pages", async ({ app, page }) => {
  await app.addLayer("pts");
  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: "Actions for pts" }).click();
  await app.menuItem("Open attribute table").click();
  await expect(page.getByText(/60,000 rows · showing 1–100/)).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText(/showing 101–200/)).toBeVisible();
});

test("the basemap switches", async ({ app, page }) => {
  await page.getByTitle("Switch the map basemap").click();
  await app.menuItem("Dark (offline)").click();
  await expect(page.getByTitle("Switch the map basemap")).toContainText("Dark (offline)");
  expect(
    await page.evaluate(() =>
      window.gisMap().getStyle().layers.some((l: { id: string }) => l.id.startsWith("gis-basemap:")),
    ),
  ).toBe(true);
});

test("the sidebar collapses to a rail and reveals a panel", async ({ app, page }) => {
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(app.sidebarTab("Layers")).toHaveAttribute("aria-selected", "true");
});
