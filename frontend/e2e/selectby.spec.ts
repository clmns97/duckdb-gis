import { test, expect, type App } from "./fixtures";

const selectedNames = async (app: App, table: string): Promise<string[]> => {
  const id = (await app.layer(table))!.id;
  const fids: number[] = await app.page.evaluate((id) => window.gisSelection.keys(id), id);
  if (fids.length === 0) return [];
  const rows = await app.sql(
    `SELECT name FROM (SELECT *, row_number() OVER () AS f FROM demo.main.${table}) WHERE f IN (${fids.join(",")}) ORDER BY name`,
  );
  return rows.map((r) => String(r.name));
};

test("Select by expression selects matching features, in each mode", async ({ app, page }) => {
  await app.addLayer("cities");
  const byExpr = async (where: string, mode: string) => {
    await page.getByRole("button", { name: "Processing" }).click();
    await app.menuItem("Select by expression…").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Expression").fill(where);
    await dialog.getByLabel("Mode").selectOption({ label: mode });
    await dialog.getByRole("button", { name: "Select", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  };

  await byExpr("population > 20000000", "Create new selection");
  expect(await selectedNames(app, "cities")).toEqual(["Delhi", "Shanghai", "São Paulo", "Tokyo"]);
  await expect(page.getByRole("status")).toContainText("4 selected · cities");

  await byExpr("country = 'CH'", "Add to current selection");
  expect(await selectedNames(app, "cities")).toHaveLength(5);
  await byExpr("country IN ('JP', 'CN')", "Remove from current selection");
  expect(await selectedNames(app, "cities")).toEqual(["Delhi", "São Paulo", "Zürich"]);
  await byExpr("population < 1000000", "Select within current selection");
  expect(await selectedNames(app, "cities")).toEqual(["Zürich"]);
});

test("a bad expression shows the error and keeps the dialog open", async ({ app, page }) => {
  await app.addLayer("cities");
  await page.getByRole("button", { name: "Processing" }).click();
  await app.menuItem("Select by expression…").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Expression").fill("no_such_column > 1");
  await dialog.getByRole("button", { name: "Select", exact: true }).click();
  await expect(dialog.getByText(/no_such_column/)).toBeVisible();
});

test("Select by location relates features to another layer", async ({ app, page }) => {
  for (const t of ["regions", "cities"]) await app.addLayer(t); // cities active
  const byLocation = (predicate: string, metres = 0) =>
    app.withModule(
      "/src/lib/selectBy.ts",
      `(m) => m.selectByLocation(window.gisLayers.list().find((l) => l.name === "cities").id, ${JSON.stringify(predicate)},
         { layerId: window.gisLayers.list().find((l) => l.name === "regions").id, selectedOnly: false }, "replace", ${metres})` as never,
    );

  await byLocation("within");
  expect(await selectedNames(app, "cities")).toEqual(["Zürich"]);
  await byLocation("disjoint");
  expect(await selectedNames(app, "cities")).toHaveLength(7);
  // Zürich lies in the regions; Berlin and London are ~550–600 km from them.
  await byLocation("dwithin", 400_000);
  expect(await selectedNames(app, "cities")).toEqual(["Zürich"]);
  await byLocation("dwithin", 700_000);
  expect(await selectedNames(app, "cities")).toEqual(["Berlin", "London", "Zürich"]);

  // the dialog: other layer defaults to a different layer than the selected one
  await page.getByRole("button", { name: "Processing" }).click();
  await app.menuItem("Select by location…").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("where the features").selectOption({ label: "are within" });
  await dialog.getByRole("button", { name: "Select", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await selectedNames(app, "cities")).toEqual(["Zürich"]);
});
