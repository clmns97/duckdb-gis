import { test, expect, type App } from "./fixtures";

const size = (app: App, id: string): Promise<number> =>
  app.page.evaluate((id) => window.gisSelection.size(id), id);
const layerId = async (app: App, name: string): Promise<string> => (await app.layer(name))!.id;

test("clicks select on the active layer only, and each layer keeps its own selection", async ({ app, page }) => {
  await app.addLayer("regions");
  await app.addLayer("cities"); // the newest layer is the active one
  const [regions, cities] = [await layerId(app, "regions"), await layerId(app, "cities")];
  await app.jump(8.54, 47.37, 6);

  const zurich = await app.mapPx(8.5417, 47.3769);
  await page.mouse.click(zurich.x, zurich.y);
  await expect.poll(() => size(app, cities)).toBe(1);
  expect(await size(app, regions)).toBe(0);

  // a click on regions while cities is active picks nothing there
  const alps = await app.mapPx(9.8, 46.3);
  await page.mouse.click(alps.x, alps.y);
  await expect.poll(() => size(app, cities)).toBe(0); // an empty click clears
  expect(await size(app, regions)).toBe(0);
  await page.mouse.click(zurich.x, zurich.y);

  await app.sidebarTab("Layers").click();
  await page.getByText("regions", { exact: true }).click(); // make it active
  await page.mouse.click(alps.x, alps.y);
  await expect.poll(() => size(app, regions)).toBe(1);
  expect(await size(app, cities)).toBe(1);
  await expect(page.getByRole("status")).toContainText("1 selected · regions");

  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(await size(app, regions)).toBe(0);
  expect(await size(app, cities)).toBe(1);
});

test("select mode adds features with a box and removes them with Alt+box", async ({ app, page }) => {
  await app.addLayer("cities");
  const cities = await layerId(app, "cities");
  await app.jump(7, 50, 4);
  await page.getByRole("button", { name: "Select features" }).click();

  const drag = async (from: [number, number], to: [number, number], alt = false) => {
    const a = await app.mapPx(...from);
    const b = await app.mapPx(...to);
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
  };
  await drag([-2, 54], [15, 46]); // London, Zürich, Berlin
  await expect.poll(() => size(app, cities)).toBe(3);
  await drag([12, 54], [15, 51], true); // Berlin
  await expect.poll(() => size(app, cities)).toBe(2);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("taps in select mode add and remove features", async ({ app, page }) => {
    await app.addLayer("cities");
    const cities = await layerId(app, "cities");
    await app.jump(11, 50, 3);
    await page.getByRole("button", { name: "Select features" }).tap();
    const tap = async (lng: number, lat: number) => {
      const p = await app.mapPx(lng, lat);
      await page.touchscreen.tap(p.x, p.y);
    };
    await tap(8.5417, 47.3769);
    await expect.poll(() => size(app, cities)).toBe(1);
    await tap(13.405, 52.52);
    await expect.poll(() => size(app, cities)).toBe(2);
    await tap(8.5417, 47.3769);
    await expect.poll(() => size(app, cities)).toBe(1);
  });
});

test("Processing ▸ Merge unions the selected features into a new layer", async ({ app, page }) => {
  await app.runSql("SELECT geom FROM demo.regions");
  await page.evaluate(() =>
    window.gisSelection.select("L_sql_preview", [{ key: 1 }, { key: 2 }], "replace"),
  );
  await page.getByRole("button", { name: "Processing" }).click();
  await app.menuItem("Merge selected features").click();
  await app.layersSettled();
  expect((await app.layer("Merge result 1"))?.status).toBe("ready");
});
