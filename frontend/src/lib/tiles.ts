import maplibregl from "maplibre-gl";
import { query } from "./duckdb";
import { getMap } from "./mapBus";

// ---------------------------------------------------------------------------
// ST_AsMVT tile renderer (spec §4, for large persistent layers you pan/zoom).
//
// The complement of the whole-layer Arrow render path (deckRender.ts): instead
// of shipping the whole result to the browser, MapLibre requests one tile per
// z/x/y as you navigate,
// and each request runs a viewport-culled ST_AsMVT query against native DuckDB
// via a custom map protocol. Three findings drive the design (see project memory
// "GeoJSON vs ST_AsMVT BENCHMARK"):
//
//   1. Geometry is stored + indexed in EPSG:3857 (ST_AsMVTGeom needs 3857; the
//      R-tree lives on that column) — see prepareTileLayer().
//   2. Tiles are filtered with the `&&` bbox operator (R-tree prune, ~ms), never
//      ST_Intersects (~0.9s, poor pruning inside the MVT subquery).
//   3. Per-zoom simplification: low-zoom tiles otherwise encode every feature
//      (e.g. 147k feats → 1.4s). Tolerance grows as you zoom out and vanishes at
//      high zoom, so tiles stay cheap + legible without dropping detail up close.
// ---------------------------------------------------------------------------

const PROTOCOL = "gis";
const TILE_EXTENT = 4096; // MVT coordinate resolution
const TILE_BUFFER = 64; // MVT edge buffer (px at 4096 extent)

// Web-Mercator world width in metres; the basis for per-zoom simplification.
const WORLD_3857 = 40075016.686;
// Screen tile size (px) used to express simplify tolerance in ~pixels of detail.
const TILE_PX = 512;
// Default tolerance in screen-pixels: sub-pixel detail is dropped per zoom.
const DEFAULT_SIMPLIFY_PX = 1.5;

export interface TileLayerSpec {
  /** Stable id: names the MVT layer, the map source, and the tile URL path. */
  id: string;
  /** FROM target: a table/view name (`main.buildings`) or `(SELECT …)` subquery. */
  table: string;
  /** EPSG:3857 geometry column carrying the R-tree index. Default `geom_3857`. */
  geom?: string;
  /**
   * Property columns to carry into the tiles.
   *   undefined → all columns except the geometry (`* EXCLUDE (geom)`)
   *   []        → geometry only, no properties
   *   [names]   → just those columns
   */
  properties?: string[];
  /** Extra boolean SQL AND-ed onto the `&&` viewport filter (attribute filter). */
  filter?: string;
  /** Simplify tolerance in screen-pixels; 0 disables. Default 1.5. */
  simplifyPx?: number;
  minzoom?: number;
  maxzoom?: number;
  /** Paint overrides, merged over the defaults, per geometry family. */
  paint?: {
    fill?: Record<string, unknown>;
    line?: Record<string, unknown>;
    circle?: Record<string, unknown>;
  };
}

const registry = new Map<string, TileLayerSpec>();
let protocolInstalled = false;

// --- SQL helpers -----------------------------------------------------------

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Simplify tolerance in 3857 units for a zoom: sub-pixel detail at every zoom. */
function toleranceFor(z: number, px: number): number {
  return (WORLD_3857 / (2 ** z * TILE_PX)) * px;
}

function buildTileSql(spec: TileLayerSpec, z: number, x: number, y: number): string {
  const geomCol = spec.geom ?? "geom_3857";
  const env = `ST_TileEnvelope(${z}, ${x}, ${y})`;

  const px = spec.simplifyPx ?? DEFAULT_SIMPLIFY_PX;
  const tol = toleranceFor(z, px);
  // ST_SimplifyPreserveTopology thins line/polygon vertices; points pass through
  // untouched. Skip it entirely at high zoom where tolerance is sub-metre.
  const geomExpr =
    px > 0 && tol > 0.01
      ? `ST_SimplifyPreserveTopology(${ident(geomCol)}, ${tol})`
      : ident(geomCol);

  const props =
    spec.properties === undefined
      ? `, * EXCLUDE (${ident(geomCol)})`
      : spec.properties.length
        ? ", " + spec.properties.map(ident).join(", ")
        : "";

  const extra = spec.filter ? ` AND (${spec.filter})` : "";

  // ST_AsMVTGeom clips the (simplified) 3857 geometry into tile space; the outer
  // aggregate packs the surviving rows into one MVT blob named `geom`.
  return (
    `SELECT ST_AsMVT(t, ${sqlStr(spec.id)}, ${TILE_EXTENT}, 'geom') AS tile ` +
    `FROM (` +
    `SELECT ST_AsMVTGeom(${geomExpr}, ST_Extent(${env}), ${TILE_EXTENT}, ${TILE_BUFFER}, true) AS geom${props} ` +
    `FROM ${spec.table} ` +
    `WHERE ${ident(geomCol)} && ${env}${extra}` +
    `) t WHERE t.geom IS NOT NULL`
  );
}

// --- Custom protocol -------------------------------------------------------

const EMPTY_TILE = new ArrayBuffer(0);

/** Registers the `gis://` MapLibre protocol once. Safe to call repeatedly. */
export function installTileProtocol(): void {
  if (protocolInstalled) return;
  protocolInstalled = true;

  maplibregl.addProtocol(PROTOCOL, async (params) => {
    // URL shape: gis://<layerId>/<z>/<x>/<y>
    const rest = params.url.replace(/^gis:\/\//, "");
    const m = rest.match(/^(.+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (!m) throw new Error(`bad tile url: ${params.url}`);
    const [, id, zs, xs, ys] = m;
    const spec = registry.get(id);
    if (!spec) throw new Error(`unknown tile layer: ${id}`);

    const rows = await query(buildTileSql(spec, +zs, +xs, +ys));
    // ST_AsMVT returns a BLOB; the client decodes it to a value carrying `bytes`.
    const value = rows[0]?.tile as { bytes?: Uint8Array } | null | undefined;
    const bytes = value?.bytes;
    if (!bytes || bytes.byteLength === 0) return { data: EMPTY_TILE };

    // Copy out of the (possibly shared) backing buffer into a tight ArrayBuffer.
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return { data };
  });
}

// --- Map layer management --------------------------------------------------

const DEFAULT_FILL = {
  "fill-color": "#6366f1",
  "fill-opacity": 0.35,
  "fill-outline-color": "#494ab9",
};
const DEFAULT_LINE = { "line-color": "#494ab9", "line-width": 2 };
const DEFAULT_CIRCLE = {
  "circle-color": "#6366f1",
  "circle-radius": 4,
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 1.2,
};

function addSourceAndLayers(map: maplibregl.Map, spec: TileLayerSpec): void {
  const src = sourceId(spec.id);
  if (!map.getSource(src)) {
    map.addSource(src, {
      type: "vector",
      tiles: [`${PROTOCOL}://${spec.id}/{z}/{x}/{y}`],
      minzoom: spec.minzoom ?? 0,
      maxzoom: spec.maxzoom ?? 22,
    });
  }
  // One style layer per geometry family, all reading the same MVT source-layer;
  // a tile may mix geometry types, so each layer filters on $type.
  const common = { source: src, "source-layer": spec.id } as const;
  if (!map.getLayer(`${spec.id}-fill`)) {
    map.addLayer({
      id: `${spec.id}-fill`,
      type: "fill",
      ...common,
      filter: ["==", "$type", "Polygon"],
      paint: { ...DEFAULT_FILL, ...spec.paint?.fill },
    });
  }
  if (!map.getLayer(`${spec.id}-line`)) {
    map.addLayer({
      id: `${spec.id}-line`,
      type: "line",
      ...common,
      filter: ["==", "$type", "LineString"],
      paint: { ...DEFAULT_LINE, ...spec.paint?.line },
    });
  }
  if (!map.getLayer(`${spec.id}-circle`)) {
    map.addLayer({
      id: `${spec.id}-circle`,
      type: "circle",
      ...common,
      filter: ["==", "$type", "Point"],
      paint: { ...DEFAULT_CIRCLE, ...spec.paint?.circle },
    });
  }
}

function sourceId(id: string): string {
  return `tiles:${id}`;
}

/**
 * Adds (or refreshes) a tiled vector layer backed by ST_AsMVT. The layer's table
 * must already hold an indexed EPSG:3857 geometry column — see prepareTileLayer.
 */
export function addTileLayer(spec: TileLayerSpec): void {
  registry.set(spec.id, spec);
  installTileProtocol();
  const map = getMap();
  if (!map) return;

  const apply = () => {
    // Re-adding a spec: drop the stale source so new tiles are fetched.
    removeMapLayer(map, spec.id);
    addSourceAndLayers(map, spec);
  };
  if (map.isStyleLoaded()) apply();
  else map.once("load", apply);
}

function removeMapLayer(map: maplibregl.Map, id: string): void {
  for (const suffix of ["fill", "line", "circle"]) {
    const layerId = `${id}-${suffix}`;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  const src = sourceId(id);
  if (map.getSource(src)) map.removeSource(src);
}

/** Removes a tiled layer from the map and forgets its spec. */
export function removeTileLayer(id: string): void {
  registry.delete(id);
  const map = getMap();
  if (map) removeMapLayer(map, id);
}

// --- Layer preparation -----------------------------------------------------

export interface PrepareTileLayerOptions {
  /** Source table/view name or a `(SELECT …)` subquery to materialise from. */
  source: string;
  /** Table to create (CREATE OR REPLACE), e.g. `main.buildings_tiles`. */
  target: string;
  /** Input geometry column on the source. Default `geom`. */
  geom?: string;
  /**
   * SRID of the input geometry. `4326` (default) transforms lon/lat → 3857;
   * `3857` copies as-is; any other EPSG code transforms from that code.
   */
  srid?: number;
}

/**
 * Materialises a tile-ready table: reprojects the source geometry into an
 * EPSG:3857 column named `geom_3857` and builds the R-tree index the `&&`
 * viewport filter relies on. Run once per persistent layer, then addTileLayer.
 */
export async function prepareTileLayer(opts: PrepareTileLayerOptions): Promise<void> {
  const geom = opts.geom ?? "geom";
  const srid = opts.srid ?? 4326;
  const geomExpr =
    srid === 3857
      ? ident(geom)
      : `ST_Transform(${ident(geom)}, 'EPSG:${srid}', 'EPSG:3857')`;

  // always_xy: our geometries are (lon, lat) = (x, y); without it ST_Transform
  // uses EPSG:4326 authority order (lat, lon) and silently relocates data ~90°.
  await query("SET geometry_always_xy=true;");
  await query(
    `CREATE OR REPLACE TABLE ${opts.target} AS ` +
      `SELECT * EXCLUDE (${ident(geom)}), ${geomExpr} AS geom_3857 ` +
      `FROM (SELECT * FROM ${opts.source}) _s ` +
      `WHERE ${ident(geom)} IS NOT NULL;`,
  );

  // Index name must be unique in the schema; derive it from the bare table name.
  const bare = opts.target.split(".").pop() ?? opts.target;
  const idxName = ident(`${bare.replace(/"/g, "")}_geom_3857_rtree`);
  await query(`CREATE INDEX ${idxName} ON ${opts.target} USING RTREE (geom_3857);`);
}
