import { test, expect, type App } from "./fixtures";

// Run a processing tool through the store (the dialog has its own test) and
// return the result table's rows: geometry type plus any extra columns asked for.
async function run(
  app: App,
  toolId: string,
  table: string,
  values: Record<string, string | number> = {},
  extra = "",
  overlay?: string,
): Promise<Record<string, unknown>[]> {
  const layerOf = async (t: string) => {
    if (!(await app.layer(t))) await app.addLayer(t, t.startsWith("t_") ? "memory" : "demo");
    return { layerId: (await app.layer(t))!.id, selectedOnly: false };
  };
  const inputs = { input: await layerOf(table), ...(overlay ? { overlay: await layerOf(overlay) } : {}) };
  const output = `out_${toolId}`;
  await app.withModule(
    "/src/lib/geoprocessing.ts",
    `async (m) => {
      const tool = m.TOOLS.find((t) => t.id === ${JSON.stringify(toolId)});
      const values = { ...Object.fromEntries(tool.params.filter((p) => p.kind !== "layer").map((p) => [p.key, p.kind === "field" ? "" : p.default])), ...${JSON.stringify(values)} };
      await m.runTool(tool, ${JSON.stringify(inputs)}, values, ${JSON.stringify(output)});
    }` as never,
  );
  await app.layersSettled();
  expect((await app.layer(output))?.status, `${toolId} result layer`).toBe("ready");
  return app.sql(`SELECT ST_GeometryType(geom) AS t ${extra} FROM memory.main.${output} ORDER BY ALL`);
}

const types = (rows: Record<string, unknown>[]) => rows.map((r) => r.t);

test("Dissolve from the Processing menu reads only the selected features", async ({ app, page }) => {
  for (const t of ["cities", "regions"]) await app.addLayer(t);
  const id = (await app.layer("regions"))!.id;
  await page.evaluate((id) => window.gisSelection.select(id, [{ key: 1 }], "replace"), id);

  await page.getByRole("button", { name: "Processing" }).click();
  await app.menuItem("Dissolve…").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox").first()).toHaveValue(id); // the active layer
  await expect(dialog.getByLabel("Selected features only (1)")).toBeChecked();
  await expect(dialog.getByLabel("Output layer")).toHaveValue("regions_dissolve");
  await dialog.getByRole("button", { name: "Run" }).click();
  await expect(dialog).toHaveCount(0);
  await app.layersSettled();
  expect((await app.layer("regions_dissolve"))?.status).toBe("ready");
  const [{ n }] = await app.sql("SELECT sum(feature_count)::INT AS n FROM memory.main.regions_dissolve");
  expect(n).toBe(1);
});

test("single-layer tools produce the expected geometry", async ({ app }) => {
  test.setTimeout(120_000);
  // Buffer: a polygon per city, of ~π km² for 1 km (Zürich, measured in its UTM zone).
  const buf = await run(app, "buffer", "cities", { distance: 1000 });
  const [{ km2 }] = await app.sql(
    "SELECT ST_Area(ST_Transform(geom, 'EPSG:4326', 'EPSG:32632', always_xy := true)) / 1e6 AS km2 FROM memory.main.out_buffer WHERE name = 'Zürich'",
  );
  expect(km2 as number).toBeCloseTo(Math.PI, 1);
  expect(types(buf)).toEqual(Array(8).fill("POLYGON"));

  expect(types(await run(app, "centroids", "regions"))).toEqual(["POINT", "POINT"]);
  expect(types(await run(app, "convex_hull", "regions", { scope: "all" }))).toEqual(["POLYGON"]);
  expect(types(await run(app, "concave_hull", "cities"))).toEqual(["POLYGON"]);
  expect(types(await run(app, "bounding_box", "roads"))).toEqual(["POLYGON", "POLYGON"]);
  expect(types(await run(app, "simplify", "roads", { tolerance: 5000 }))).toEqual(["LINESTRING", "LINESTRING"]);
  expect(await run(app, "dissolve", "regions", {}, ", feature_count::INT AS n")).toEqual([{ t: "POLYGON", n: 2 }]);
  expect(types(await run(app, "voronoi", "cities"))).toEqual(Array(8).fill("POLYGON"));

  const attrs = await run(app, "geometry_attributes", "regions", {}, ", area_m2 > 1e9 AS big, length_m = 0 AS no_length");
  expect(attrs.every((r) => r.big && r.no_length)).toBe(true);

  // Reproject: the result declares its CRS, and still draws (reprojected back for display).
  await run(app, "reproject", "cities", { crs: "EPSG:3857" });
  const [{ ty }] = await app.sql(
    "SELECT data_type AS ty FROM duckdb_columns() WHERE table_name = 'out_reproject' AND column_name = 'geom'",
  );
  expect(ty).toBe("GEOMETRY('EPSG:3857')");

  await app.sql("CREATE TABLE memory.main.t_multi AS SELECT ST_GeomFromText('MULTIPOINT((1 1), (2 2), (3 3))') AS geom");
  expect(types(await run(app, "explode", "t_multi"))).toEqual(["POINT", "POINT", "POINT"]);
  await app.sql("CREATE TABLE memory.main.t_bowtie AS SELECT ST_GeomFromText('POLYGON((0 0, 2 2, 2 0, 0 2, 0 0))') AS geom");
  const fixed = await run(app, "fix", "t_bowtie", {}, ", ST_IsValid(geom) AS ok");
  expect(fixed.map((r) => r.ok)).toEqual([true]);
});

test("overlay tools combine two layers", async ({ app }) => {
  test.setTimeout(120_000);
  // Two overlapping 2×2 squares, offset by 1: they share a 1×1 square.
  await app.sql(`CREATE TABLE memory.main.t_a AS SELECT 'a' AS name, ST_GeomFromText('POLYGON((0 0, 2 0, 2 2, 0 2, 0 0))') AS geom`);
  await app.sql(`CREATE TABLE memory.main.t_b AS SELECT 'b' AS name, ST_GeomFromText('POLYGON((1 1, 3 1, 3 3, 1 3, 1 1))') AS geom`);
  const area = ", round(ST_Area(geom), 6) AS area";

  expect(await run(app, "clip", "t_a", {}, area, "t_b")).toEqual([{ t: "POLYGON", area: 1 }]);
  expect(await run(app, "difference", "t_a", {}, area, "t_b")).toEqual([{ t: "POLYGON", area: 3 }]);
  expect(await run(app, "intersection", "t_a", {}, `${area}, name, overlay_name`, "t_b")).toEqual([
    { t: "POLYGON", area: 1, name: "a", overlay_name: "b" },
  ]);
  expect(await run(app, "union", "t_a", {}, `${area}, name, overlay_name`, "t_b")).toEqual([
    { t: "POLYGON", area: 1, name: "a", overlay_name: "b" },
    { t: "POLYGON", area: 3, name: "a", overlay_name: null },
    { t: "POLYGON", area: 3, name: null, overlay_name: "b" },
  ]);
  expect(await run(app, "merge_layers", "t_a", {}, ", name", "t_b")).toEqual([
    { t: "POLYGON", name: "a" },
    { t: "POLYGON", name: "b" },
  ]);

  // Zürich lies in both demo regions; the other cities in none.
  const joined = await run(app, "spatial_join", "cities", {}, ", name, overlay_name", "regions");
  expect(joined).toHaveLength(9);
  expect(joined.filter((r) => r.name === "Zürich").map((r) => r.overlay_name)).toEqual(["Alpine box", "Rhine box"]);
  expect(await app.sql("SELECT count(*)::INT AS n FROM memory.main.out_spatial_join WHERE overlay_name IS NULL")).toEqual([{ n: 7 }]);

  const counts = await run(app, "count_points", "regions", {}, ", name, point_count::INT AS n", "cities");
  expect(counts.map((r) => [r.name, r.n])).toEqual([["Alpine box", 1], ["Rhine box", 1]]);
});
