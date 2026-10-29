import { test, expect, type App } from "./fixtures";

async function saveProject(app: App, path: string, name = ""): Promise<void> {
  await app.page.getByRole("button", { name: "Project" }).click();
  await app.menuItem("Save project").click();
  await app.page.getByPlaceholder("/data/my-project.duckdb").fill(path);
  if (name) await app.page.getByPlaceholder("Untitled project").fill(name);
  await app.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(app.page.getByRole("dialog")).toHaveCount(0);
}

async function openProject(app: App, path: string): Promise<void> {
  await app.page.getByRole("button", { name: "Project" }).click();
  await app.menuItem("Open project").click();
  await app.page.getByPlaceholder("/data/my-project.duckdb").fill(path);
  await app.page.getByPlaceholder("/data/my-project.duckdb").press("Enter");
  await expect(app.page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await app.layersSettled();
}

test("save then open restores layers, style, order and working tables", async ({ app, page }, info) => {
  const path = info.outputPath("project.duckdb");
  await app.sql("CREATE TABLE memory.main.local AS SELECT ST_Point(1, 2) AS geom");
  await app.addLayer("local", "memory");
  await app.addLayer("regions");
  await page.evaluate(() => {
    const id = window.gisLayers.list().find((l: { name: string }) => l.name === "regions").id;
    window.gisLayers.setStyle(id, { fillColor: [255, 0, 0] });
  });
  await page.evaluate(() =>
    window.gisLayers.addQuery({ id: "q1", name: "query layer", sql: "SELECT ST_Point(3, 4) AS geom" }),
  );
  await app.layersSettled();
  const before = (await app.layers()).map((l) => l.name);

  await saveProject(app, path, "e2e");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);

  // the file's _gis.layers rows
  await app.sql(`ATTACH '${path}' AS saved (READ_ONLY)`);
  const rows = await app.sql(
    "SELECT name, source_kind AS kind, external FROM saved._gis.layers ORDER BY z_order",
  );
  await app.sql("DETACH saved");
  expect(rows).toEqual([
    { name: "query layer", kind: "query", external: false },
    { name: "regions", kind: "table", external: true },
    { name: "local", kind: "table", external: false },
  ]);

  // a fresh session (reload drops every layer), then open
  await page.evaluate(() => window.gisLayers.list().forEach((l: { id: string }) => window.gisLayers.remove(l.id)));
  await app.sql("DROP TABLE memory.main.local");
  await openProject(app, path);
  expect((await app.layers()).map((l) => l.name)).toEqual(before);
  const fill = await page.evaluate(
    () => window.gisLayers.list().find((l: { name: string }) => l.name === "regions").style.fillColor,
  );
  expect(fill).toEqual([255, 0, 0]);
  expect(await app.sql("SELECT count(*)::INT AS n FROM memory.main.local")).toEqual([{ n: 1 }]);
});

test("opening a project over unsaved work asks first", async ({ app, page }, info) => {
  const path = info.outputPath("project.duckdb");
  await app.addLayer("cities");
  await saveProject(app, path);
  await app.withModule("/src/lib/unsavedChanges.ts", (m) => m.unsavedChanges.markDirty());
  const asked = page.waitForEvent("dialog").then((d) => d.message());
  await openProject(app, path);
  expect(await asked).toMatch(/unsaved changes/);
  expect((await app.layers()).map((l) => l.name)).toEqual(["cities"]);
});
