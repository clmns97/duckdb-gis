import { test, expect, type App } from "./fixtures";

// Web feature services (#121). Tests tagged @network fetch from public
// services (BKG, MapServer's and GeoSolutions' demo servers, pygeoapi's demo,
// Esri) and are skipped in CI (`--grep-invert @network`).

const MAPSERVER = "https://demo.mapserver.org/cgi-bin/wfs";
const GEOSERVER = "https://gs-stable.geo-solutions.it/geoserver/wfs";

/** Rows and lon/lat extent of a working-catalog table. */
async function tableStats(app: App, table: string) {
  const [r] = await app.sql(
    `SELECT count(*)::INT AS n, min(ST_XMin(geom)) AS xmin, max(ST_XMax(geom)) AS xmax,
            min(ST_YMin(geom)) AS ymin, max(ST_YMax(geom)) AS ymax FROM memory.main."${table}"`,
  );
  return r as { n: number; xmin: number; xmax: number; ymin: number; ymax: number };
}

/** Connect and add `layer` through the store (the dialog has its own test);
 *  returns the new layer's id and table. `gml` drops the service's GeoJSON
 *  format, as if it offered only GML. */
async function addFromService(app: App, url: string, layer: string, gml = false) {
  const added = await app.page.evaluate(
    async ([url, layer, gml]) => {
      const s = await window.gisWebServices.connect(url, "auto");
      const service = gml ? { ...s, outputFormat: undefined, gml: true } : s;
      await window.gisWebServices.addLayer(service, s.layers.find((l: { id: string }) => l.id === layer));
      const l = window.gisLayers.list()[0];
      return { id: l.id as string, table: l.source.table as string };
    },
    [url, layer, gml] as const,
  );
  await app.layersSettled();
  return added;
}

const serviceState = (app: App, id: string) =>
  app.page.evaluate((id) => {
    const s = window.gisWebServices.get(id);
    return { fetched: s.fetched, total: s.total, capped: s.capped, scope: s.scope, busy: s.busy };
  }, id);

test("the service type is guessed from the address", async ({ app }) => {
  const guesses = await app.withModule("/src/lib/webServices.ts", (m) =>
    [
      "https://example.org/geoserver/wfs",
      "https://sgx.geodatenzentrum.de/wfs_vg250",
      "https://example.org/cgi-bin/mapserv?map=x.map&SERVICE=WFS",
      "https://example.org/arcgis/rest/services/X/FeatureServer/0",
      "https://example.org/arcgis/rest/services/X/MapServer",
      "https://example.org/ogcapi/collections/lakes/items",
      "https://example.org/somewhere",
      "https://sgx.geodatenzentrum.de/wms_topplus_open",
      "https://example.org/geoserver/ows?SERVICE=WMS&REQUEST=GetCapabilities",
      "https://sgx.geodatenzentrum.de/wmts_topplus_open/1.0.0/WMTSCapabilities.xml",
      "https://mapsneu.wien.gv.at/basemapneu/1.0.0/WMTSCapabilities.xml",
    ].map((u) => m.guessType(u)),
  );
  expect(guesses).toEqual(["wfs", "wfs", "wfs", "arcgis", "arcgis", "ogcapi", null, "wms", "wms", "wmts", "wmts"]);
});

test("a non-http address is refused in the dialog", async ({ app, page }) => {
  await page.getByTitle(/Add a layer from a WFS/).click();
  await page.getByLabel("Service address").fill("not a url");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText(/Enter an http/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible(); // still open
  void app;
});

test("a service layer keeps its service across a project save and open", async ({ app, page }, info) => {
  const path = info.outputPath("project.duckdb");
  // A table standing in for fetched features, linked to a made-up service —
  // no network: this is about the project file, not the fetch.
  await app.sql("CREATE TABLE memory.main.svc_roads AS SELECT ST_Point(1, 2) AS geom");
  await app.addLayer("svc_roads", "memory");
  const id = (await app.layers())[0].id;
  const saved = {
    service: { type: "wfs", url: "https://example.org/wfs", title: "Example", layers: [], version: "2.0.0", paging: true },
    layer: { id: "ex:roads", title: "Roads" },
    table: "svc_roads",
    scope: "view",
    fetched: 1,
    total: 40,
    capped: true,
  };
  await page.evaluate(([id, saved]) => window.gisWebServices.restore(id, saved), [id, saved] as const);

  await app.saveProject(path);
  await page.evaluate(() => window.gisLayers.list().forEach((l: { id: string }) => window.gisLayers.remove(l.id)));
  await app.sql("DROP TABLE memory.main.svc_roads");
  await app.openProject(path);

  expect((await app.layers())[0].id).toBe(id);
  expect(await page.evaluate((id) => window.gisWebServices.snapshot(id), id)).toEqual(saved);
  await page.locator("li[draggable=true]", { hasText: "svc_roads" }).click({ button: "right" });
  await expect(app.menuItem("Refresh for current view")).toBeVisible();
  await expect(app.menuItem("Download whole layer")).toBeVisible();
});

test("the dialog connects, adds the view's features, and the menu refetches @network", async ({ app, page }) => {
  test.setTimeout(240_000);
  await app.jump(10, 50, 4);
  await page.getByTitle(/Add a layer from a WFS/).click();
  await page.getByLabel("Service address").fill(MAPSERVER);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText(/Connected to .*WFS 2\.0\.0/)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/^Layer \(/).selectOption("ms:cities");
  await page.getByRole("button", { name: "Add layer" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 90_000 });
  await app.layersSettled();

  const layer = (await app.layers())[0];
  expect(layer.status).toBe("ready");
  const table = await page.evaluate((id) => window.gisLayers.get(id).source.table, layer.id);
  const europe = await tableStats(app, table);
  expect(europe.n).toBeGreaterThan(1000);
  expect(europe.xmin).toBeGreaterThan(-20); // lon/lat, inside the European view
  expect(europe.ymin).toBeGreaterThan(35);

  // Refresh for current view: the US instead.
  await app.jump(-98, 39, 4);
  await page.locator("li[draggable=true]", { hasText: layer.name }).click({ button: "right" });
  await app.menuItem("Refresh for current view").click();
  await expect.poll(() => serviceState(app, layer.id).then((s) => s.busy), { timeout: 90_000 }).toBe(false);
  await app.layersSettled();
  const us = await tableStats(app, table);
  expect(us.xmax).toBeLessThan(-50);

  // Download whole layer (the confirm is accepted by the fixture). Part of the
  // demo data isn't valid UTF-8, so this also covers the Latin-1 fallback.
  await page.locator("li[draggable=true]", { hasText: layer.name }).click({ button: "right" });
  await app.menuItem("Download whole layer").click();
  await expect
    .poll(() => serviceState(app, layer.id), { timeout: 180_000 })
    .toMatchObject({ scope: "all", busy: false });
  const all = await serviceState(app, layer.id);
  expect(all.capped).toBe(false);
  expect((await tableStats(app, table)).n).toBe(all.total);
});

test("OGC API, ArcGIS REST and a paged GeoServer WFS each add a layer @network", async ({ app }) => {
  test.setTimeout(240_000);

  await app.jump(0, 20, 1);
  const lakes = await addFromService(app, "https://demo.pygeoapi.io/master", "lakes");
  expect((await tableStats(app, lakes.table)).n).toBeGreaterThan(10);

  await app.jump(10, 50, 4);
  const countries = await addFromService(
    app,
    "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries_(Generalized)/FeatureServer",
    "0",
  );
  expect((await tableStats(app, countries.table)).n).toBeGreaterThan(20);

  // Manhattan's roads take several 1000-feature pages.
  await app.jump(-73.97, 40.77, 12);
  const roads = await addFromService(app, GEOSERVER, "tiger:tiger_roads");
  const r = await tableStats(app, roads.table);
  expect(r.n).toBeGreaterThan(1000);
  expect(r.xmin).toBeGreaterThan(-74.1);
  expect(r.xmax).toBeLessThan(-73.8);

  for (const l of await app.layers()) expect(l.status).toBe("ready");
});

test("a WFS without GeoJSON is read as GML @network", async ({ app }) => {
  test.setTimeout(240_000);
  // GeoServer offers GeoJSON too; dropping it forces the GML path — paged
  // (Manhattan's roads take several pages) and WFS 2.0.
  await app.jump(-73.97, 40.77, 12);
  const added = await addFromService(app, GEOSERVER, "tiger:tiger_roads", true);
  const r = await tableStats(app, added.table);
  expect(r.n).toBeGreaterThan(1000);
  expect(r.xmin).toBeGreaterThan(-74.1); // lon/lat, inside the view
  expect(r.xmax).toBeLessThan(-73.8);
  const state = await serviceState(app, added.id);
  expect(state.total).toBe(r.n); // the hit count matches what was read
  const cols = (await app.sql(`DESCRIBE memory.main."${added.table}"`)).map((c) => c.column_name);
  expect(cols).toEqual(expect.arrayContaining(["NAME", "geom"]));
  expect(cols).not.toContain("gml_id");
});

// --- WMS / WMTS (#122) -------------------------------------------------------

/** A fixture capabilities document, served by Vite and fetched by DuckDB. */
const fixture = (app: App, name: string) => new URL(`/e2e/data/${name}`, app.page.url()).href;

test("WMS and WMTS capabilities become tile templates, or a reason they can't be drawn", async ({ app, page }) => {
  const [wms, wmts] = await page.evaluate(
    ([a, b]) => Promise.all([window.gisWebServices.connect(a, "wms"), window.gisWebServices.connect(b, "wmts")]),
    [fixture(app, "wms-capabilities.xml"), fixture(app, "wmts-capabilities.xml")],
  );

  expect(wms.title).toBe("Fixture WMS");
  const [topo, utm] = wms.layers;
  expect(topo.raster).toMatchObject({ type: "wms", tileSize: 256, bounds: [5, 47, 15, 55], layer: "topo" });
  // EPSG:3857 inherited from the parent layer; PNG preferred over JPEG.
  expect(topo.raster.url).toContain("LAYERS=topo&STYLES=&CRS=EPSG:3857&BBOX={bbox}&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng");
  expect(utm.raster).toBeUndefined();
  expect(utm.unsupported).toMatch(/Web Mercator/);

  const [temp, roads, parcels] = wmts.layers;
  // RESTful: style, dimension default and set filled in; levels 2–4 by identifier.
  expect(temp.raster).toMatchObject({
    type: "wmts",
    url: "https://tiles.example.org/temp/shaded/2026-01-01/merc/{z}/{y}/{x}.png",
    matrices: [null, null, "L2", "L3", "L4"],
    minZoom: 2,
    maxZoom: 4,
    bounds: [-180, -85, 180, 85],
  });
  // No ResourceURL: KVP GetTile at the advertised endpoint.
  expect(roads.raster.url).toBe(
    "https://tiles.example.org/kvp?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=roads&STYLE=default" +
      "&TILEMATRIXSET=merc&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg",
  );
  expect(parcels.unsupported).toMatch(/GoogleMapsCompatible.*only utm/);
});

test("a raster layer that can't draw is refused with the reason", async ({ app, page }) => {
  const errors = await page.evaluate(async (url) => {
    const s = await window.gisWebServices.connect(url, "wms");
    const msg = (p: Promise<unknown>) => p.then(() => "added", (e: Error) => e.message);
    const [topo, utm] = s.layers;
    return [
      await msg(window.gisWebServices.addLayer(s, utm)),
      // GetMap goes to the fixture address, which answers XML, not an image.
      await msg(window.gisWebServices.addLayer(s, topo)),
      // Nothing listens there: the same failure a server without CORS gives.
      await msg(
        window.gisWebServices.addLayer(s, { ...topo, raster: { ...topo.raster, url: "http://127.0.0.1:9/?bbox={bbox}" } }),
      ),
    ];
  }, fixture(app, "wms-capabilities.xml"));
  expect(errors[0]).toMatch(/isn't offered in Web Mercator/);
  expect(errors[1]).toMatch(/didn't answer with an image \(HTTP 200, (application|text)\/xml/);
  expect(errors[2]).toMatch(/CORS headers/);
  expect(await app.layers()).toEqual([]);
});

test("a raster layer goes under the vector layers, reorders, and keeps opacity across save and open", async ({ app, page }, info) => {
  const path = info.outputPath("project.duckdb");
  await app.addLayer("cities");
  const spec = {
    type: "wmts",
    url: "http://127.0.0.1:9/{z}/{x}/{y}.png", // never loads; this is about the layer, not tiles
    matrices: ["0", "1", "2"],
    tileSize: 256,
    minZoom: 0,
    maxZoom: 2,
    bounds: null,
    service: "http://127.0.0.1:9/wmts",
    layer: "fake",
  };
  await page.evaluate((spec) => window.gisLayers.addRaster("Imagery", spec), spec);
  const drawn = () => page.evaluate(() => window.gisDeck.drawnLayerIds() as string[]);
  const raster = (await app.layers()).find((l) => l.name === "Imagery")!;

  // Bottom of the list, drawn first (beneath the cities).
  expect((await app.layers()).map((l) => l.name)).toEqual(["cities", "Imagery"]);
  expect((await drawn())[0]).toBe(`raster-${raster.id}`);
  await page.evaluate((id) => window.gisLayers.reorder(id, 0), raster.id);
  expect((await drawn()).at(-1)).toBe(`raster-${raster.id}`);

  // Opacity from Layer Properties ▸ Symbology.
  await app.sidebarTab("Layers").click();
  await page.locator("li[draggable=true]", { hasText: "Imagery" }).click({ button: "right" });
  await app.menuItem("Layer properties…").click();
  await page.getByRole("tab", { name: "Symbology" }).click();
  await page.getByLabel("Opacity").fill("0.4");
  await page.keyboard.press("Escape");
  await page.evaluate((id) => window.gisLayers.setVisible(id, false), raster.id);

  await app.saveProject(path);
  await page.evaluate(() => window.gisLayers.list().forEach((l: { id: string }) => window.gisLayers.remove(l.id)));
  await app.openProject(path);
  const reopened = await page.evaluate((id) => window.gisLayers.get(id), raster.id);
  expect(reopened).toMatchObject({ kind: "raster", name: "Imagery", visible: false, raster: { spec, opacity: 0.4 } });
  expect((await app.layers()).map((l) => l.name)).toEqual(["Imagery", "cities"]);
});

test("WMS and WMTS layers draw tiles from public services @network", async ({ app, page }) => {
  test.setTimeout(180_000);
  const tile = (pattern: RegExp) =>
    page.waitForResponse((r) => pattern.test(r.url()) && r.ok() && /^image\//.test(r.headers()["content-type"] ?? ""), {
      timeout: 60_000,
    });
  await app.jump(10.4, 51.2, 6);

  // WMS through the dialog (BKG TopPlusOpen).
  await page.getByTitle(/Add a layer from a WFS/).click();
  await page.getByLabel("Service address").fill("https://sgx.geodatenzentrum.de/wms_topplus_open");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText(/Connected to .*\(WMS 1\.3\.0\)/)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/^Layer \(/).selectOption("web");
  const wmsTile = tile(/wms_topplus_open\?.*REQUEST=GetMap/);
  await page.getByRole("button", { name: "Add layer" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
  await wmsTile;

  // WMTS: BKG from its base address (KVP fails there, so the RESTful document),
  // and basemap.at from its capabilities document.
  for (const [url, layer, pattern] of [
    ["https://sgx.geodatenzentrum.de/wmts_topplus_open", "web_grau", /wmts_topplus_open\/tile\/1\.0\.0\/web_grau\//],
    ["https://mapsneu.wien.gv.at/basemapneu/1.0.0/WMTSCapabilities.xml", "bmapoverlay", /basemap\/bmapoverlay\//],
  ] as const) {
    const t = tile(pattern);
    await page.evaluate(
      async ([url, layer]) => {
        const s = await window.gisWebServices.connect(url, "auto");
        await window.gisWebServices.addLayer(s, s.layers.find((l: { id: string }) => l.id === layer));
      },
      [url, layer],
    );
    await t;
  }
  const kinds = (await app.layers()).map((l) => l.status);
  expect(kinds).toEqual(["ready", "ready", "ready"]);
});
