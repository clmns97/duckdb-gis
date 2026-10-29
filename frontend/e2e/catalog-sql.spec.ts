import { test, expect } from "./fixtures";

test("the Browser lists the demo tables and collapses/expands a database", async ({ app, page }) => {
  for (const t of ["cities", "regions", "roads", "pts"]) {
    await expect(page.getByText(t, { exact: true })).toBeVisible();
  }
  const demo = page.locator("li").filter({ has: page.getByText("demo", { exact: true }) }).first();
  await demo.getByRole("button", { name: "Collapse" }).first().click();
  await expect(page.getByText("cities", { exact: true })).toHaveCount(0);
  await demo.getByRole("button", { name: "Expand" }).first().click();
  await expect(page.getByText("cities", { exact: true })).toBeVisible();
  void app;
});

test("Run renders points, lines and polygons", async ({ app }) => {
  expect(
    await app.runSql(
      "SELECT 'Zürich' AS name, ST_Point(8.54, 47.37) AS geom UNION ALL SELECT 'Bern', ST_Point(7.45, 46.95);",
    ),
  ).toMatch(/2 features/);
  expect(await app.runSql("SELECT ST_GeomFromText('LINESTRING(0 0, 1 1, 2 0)') AS geom")).toMatch(/1 feature/);
  expect(await app.runSql("SELECT ST_GeomFromText('POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))') AS geom")).toMatch(
    /1 feature/,
  );
  // re-running polygons with a different row count reuses no deck layer (#101)
  expect(await app.runSql("SELECT geom FROM demo.regions")).toMatch(/2 features/);
  expect(await app.runSql("SELECT * FROM demo.pts")).toMatch(/60000 features/);
});

test("Run surfaces SQL errors and refuses projected coordinates", async ({ app }) => {
  expect(await app.runSql("SELECT * FROM nope")).toMatch(/does not exist/);
  expect(await app.runSql("SELECT ST_Point(500000, 5200000) AS geom")).toMatch(/WGS84/);
  expect((await app.layers()).find((l) => l.kind === "preview")?.status).toBe("error");
});
