import { test, expect } from "./fixtures";

test("a database file attaches read-only and detaches", async ({ app, page }, info) => {
  const path = info.outputPath("other.duckdb");
  await app.sql(`ATTACH '${path}' AS mk; CREATE TABLE mk.t AS SELECT ST_Point(1, 2) AS geom; DETACH mk;`);

  await page.getByRole("button", { name: "Attach database" }).click();
  await page.getByPlaceholder("/data/example.duckdb").fill(path);
  await page.getByLabel("Alias (optional)").fill("other_db");
  await page.getByLabel("Alias (optional)").press("Enter"); // Enter in the 2nd field submits too
  await expect(page.getByText("other_db", { exact: true })).toBeVisible();
  const ro = await app.sql("SELECT readonly FROM duckdb_databases() WHERE database_name = 'other_db'");
  expect(ro).toEqual([{ readonly: true }]);

  await page.getByRole("button", { name: "Actions for other_db" }).click();
  await app.menuItem("Detach").click();
  await expect(page.getByText("other_db", { exact: true })).toHaveCount(0);
});

test("attaching a missing file shows the error and keeps the dialog open", async ({ app, page }) => {
  void app;
  await page.getByRole("button", { name: "Attach database" }).click();
  await page.getByPlaceholder("/data/example.duckdb").fill("/nonexistent/dir/x.duckdb");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByRole("dialog").locator("p.text-danger")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});
