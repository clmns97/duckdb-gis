import { test, expect } from "./fixtures";

test("clicking a feature selects it; clearing empties the selection", async ({ app, page }) => {
  await app.addLayer("cities");
  await app.jump(8.54, 47.37, 5);
  const zurich = await app.mapPx(8.54, 47.37);
  await page.mouse.click(zurich.x, zurich.y);
  await expect.poll(() => page.evaluate(() => window.gisSelection.size)).toBe(1);
  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(await page.evaluate(() => window.gisSelection.size)).toBe(0);
});

test("Processing ▸ Merge unions the selected features into a new layer", async ({ app, page }) => {
  await app.runSql("SELECT geom FROM demo.regions");
  await page.evaluate(() => {
    const s = window.gisSelection.source();
    window.gisSelection.pick(s, 1, false);
    window.gisSelection.pick(s, 2, true); // shift-click adds
  });
  expect(await page.evaluate(() => window.gisSelection.size)).toBe(2);
  await page.getByRole("button", { name: "Processing" }).click();
  await app.menuItem("Merge selected features").click();
  await app.layersSettled();
  expect((await app.layer("Merge result 1"))?.status).toBe("ready");
});
