import { test, expect, type App } from "./fixtures";

const featureCount = (app: App) => app.page.evaluate(() => window.gisEditing.featureCount);

/** A one-polygon table in the working catalog, added as a layer. */
async function polygonLayer(app: App, name: string): Promise<void> {
  await app.sql(
    `CREATE TABLE memory.main.${name} AS SELECT 1 AS id, ST_GeomFromText('POLYGON((9.9 49.9, 10.1 49.9, 10.1 50.1, 9.9 50.1, 9.9 49.9))') AS geom`,
  );
  await app.addLayer(name, "memory");
}

/** Open "New layer" for a polygon layer and draw one square around 10°E 50°N. */
async function drawSquare(app: App, name: string): Promise<void> {
  const { page } = app;
  await app.sidebarTab("Layers").click();
  await page.getByRole("button", { name: "New layer" }).click();
  await page.getByPlaceholder("new_layer").fill(name);
  await page.getByRole("button", { name: "Polygon" }).click();
  await page.getByPlaceholder("new_layer").press("Enter"); // Enter submits the dialog
  await app.jump(10, 50, 6);
  const c = await app.mapPx(10, 50);
  const ring = [[-60, -40], [60, -40], [60, 40], [-60, 40], [-60, -40]]; // last tap closes it
  for (const [dx, dy] of ring) await app.tap(c.x + dx, c.y + dy);
  await page.waitForTimeout(400); // past the undo gesture window
  await expect.poll(() => featureCount(app)).toBe(1);
}

test("a new layer is drawn and saved as a table", async ({ app, page }) => {
  await drawSquare(app, "drawn");
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await page.getByTitle("Create the layer table and save the drawn features").click();
  await expect.poll(() => page.evaluate(() => window.gisEditing.isEditing())).toBe(false);
  expect(await app.sql("SELECT count(*)::INT AS n FROM memory.main.drawn")).toEqual([{ n: 1 }]);
  await app.layersSettled();
  expect((await app.layer("drawn"))?.status).toBe("ready");
});

test("undo removes a just-drawn feature in one step; redo restores it", async ({ app, page }) => {
  await drawSquare(app, "drawn");
  await page.keyboard.press("Control+z");
  await expect.poll(() => featureCount(app), { timeout: 3_000 }).toBe(0);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => featureCount(app)).toBe(1);
});

test("in-place edits (duplicate, rotate, scale, copy/paste, undo/redo) save back", async ({ app, page }) => {
  await polygonLayer(app, "shapes");
  await page.evaluate(() => window.gisLayers.setActive(window.gisLayers.list()[0].id));
  await page.getByTitle("Edit shapes").click();
  await expect.poll(() => featureCount(app)).toBe(1);

  await app.jump(10, 50, 8);
  const c = await app.mapPx(10, 50);
  await app.tap(c.x, c.y); // select the polygon
  await expect.poll(() => page.evaluate(() => window.gisEditing.selectedCount)).toBe(1);
  await page.getByTitle("Duplicate the selection").click();
  await page.getByTitle("Copy the selection").click();
  await page.getByTitle(/^Rotate selection/).click();
  await page.getByTitle(/^Scale selection/).click();
  await page.getByTitle("Paste features").click();
  await expect.poll(() => featureCount(app)).toBe(3);

  await page.waitForTimeout(400); // let the paste settle into its own undo step
  await page.keyboard.press("Control+z");
  await expect.poll(() => featureCount(app)).toBe(2);
  await page.keyboard.press("Control+y");
  await expect.poll(() => featureCount(app)).toBe(3);

  await page.getByTitle("Save edits back to the layer's table").click();
  await expect.poll(() => page.evaluate(() => window.gisEditing.isEditing())).toBe(false);
  expect(await app.sql("SELECT count(*)::INT AS n FROM memory.main.shapes")).toEqual([{ n: 3 }]);
});

test("stopping an edit discards it", async ({ app, page }) => {
  await polygonLayer(app, "keep");
  await page.evaluate(() => window.gisEditing.beginEdit(window.gisLayers.list()[0]));
  await expect.poll(() => featureCount(app)).toBe(1);
  await app.jump(10, 50, 8);
  const c = await app.mapPx(10, 50);
  await app.tap(c.x, c.y);
  await page.getByTitle("Delete the selected feature(s)").click();
  await expect.poll(() => featureCount(app)).toBe(0);
  await page.getByTitle(/^Stop editing/).click();
  await expect.poll(() => page.evaluate(() => window.gisEditing.isEditing())).toBe(false);
  expect(await app.sql("SELECT count(*)::INT AS n FROM memory.main.keep")).toEqual([{ n: 1 }]);
});
