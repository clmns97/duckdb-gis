import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";
import {
  GeoArrowScatterplotLayer,
  GeoArrowPathLayer,
  GeoArrowPolygonLayer,
} from "@geoarrow/deck.gl-geoarrow";
import { tableFromIPC, type RecordBatch, type Table } from "apache-arrow";
import { query, str } from "./duckdb";
import { getMap } from "./mapBus";

// ---------------------------------------------------------------------------
// Unified GeoArrow render path. Geometry is encoded server-side by the
// `duck_geoarrow` extension's `st_asgeoarrow*` functions into native GeoArrow
// memory layout (STRUCT(x,y) coords nested by LIST), shipped as an Arrow-IPC
// stream via `to_arrow_ipc`, and handed straight to the GeoArrow deck.gl layers
// — which triangulate/tesselate on the GPU with zero per-row JS objects. Run
// probes the geometry type first and dispatches to the matching layer.
// ---------------------------------------------------------------------------

// The ui-client decodes a BLOB result to a value carrying `.bytes`; extract it.
const wkbBytes = (v: unknown): Uint8Array => (v as { bytes: Uint8Array }).bytes;
const clean = (sql: string) => sql.trim().replace(/;\s*$/, "");

let overlay: MapboxOverlay | null = null;
let overlayMap: maplibregl.Map | null = null;

function ensureOverlay(map: maplibregl.Map): MapboxOverlay {
  if (overlay && overlayMap === map) return overlay;
  overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);
  overlayMap = map;
  return overlay;
}

export interface DeckTimings {
  queryMs: number; // DuckDB round-trips (probe + st_asgeoarrow encode)
  parseMs: number; // Arrow-IPC → table + layer construction
  bytes: number; // geometry payload (IPC stream)
}

export interface DeckOutcome {
  featureCount: number;
  timings: DeckTimings;
}

// A representative geometry type for the result, plus its extent for fitBounds.
interface Probe {
  type: string; // ST_GeometryType, e.g. "POLYGON"
  count: number;
  bounds: [number, number, number, number] | null; // [xmin,ymin,xmax,ymax]
}

// Maps a DuckDB geometry type to the encoder function + a layer factory. Single
// and Multi variants of a family share a layer (the GeoArrow layers accept both
// PointData/MultiPointData, Polygon/MultiPolygon, …).
interface GeomSpec {
  fn: string; // duck_geoarrow encoder
  layer: (batch: RecordBatch, geom: unknown, id: string) => Layer;
}

const POINT = (batch: RecordBatch, geom: unknown, id: string): Layer =>
  new GeoArrowScatterplotLayer({
    id,
    data: batch,
    getPosition: geom as never,
    getRadius: 4,
    radiusUnits: "pixels",
    getFillColor: [99, 102, 241, 200],
    stroked: true,
    getLineColor: [255, 255, 255],
    lineWidthUnits: "pixels",
    getLineWidth: 1,
  });

const PATH = (batch: RecordBatch, geom: unknown, id: string): Layer =>
  new GeoArrowPathLayer({
    id,
    data: batch,
    getPath: geom as never,
    getColor: [73, 74, 185],
    widthUnits: "pixels",
    getWidth: 2,
    capRounded: true,
    jointRounded: true,
  });

const POLYGON = (batch: RecordBatch, geom: unknown, id: string): Layer =>
  new GeoArrowPolygonLayer({
    id,
    data: batch,
    getPolygon: geom as never,
    filled: true,
    getFillColor: [99, 102, 241, 90],
    stroked: true,
    getLineColor: [73, 74, 185],
    getLineWidth: 1,
    lineWidthUnits: "pixels",
    // Triangulate on the main thread instead of fetching the earcut worker from
    // a CDN — deterministic and offline-safe. (Revisit with a self-hosted worker
    // if main-thread earcut becomes a bottleneck on very large polygon sets.)
    earcutWorkerUrl: null,
  });

const SPECS: Record<string, GeomSpec> = {
  POINT: { fn: "st_asgeoarrowpoint", layer: POINT },
  MULTIPOINT: { fn: "st_asgeoarrowmultipoint", layer: POINT },
  LINESTRING: { fn: "st_asgeoarrowlinestring", layer: PATH },
  MULTILINESTRING: { fn: "st_asgeoarrowmultilinestring", layer: PATH },
  POLYGON: { fn: "st_asgeoarrowpolygon", layer: POLYGON },
  MULTIPOLYGON: { fn: "st_asgeoarrowmultipolygon", layer: POLYGON },
};

/**
 * Run a user query and render its geometry through the matching GeoArrow layer.
 * Dispatches on the result's geometry type (point → Scatterplot, line → Path,
 * polygon → Polygon).
 */
export async function renderGeoArrow(userSql: string): Promise<DeckOutcome> {
  const inner = clean(userSql);

  const t0 = performance.now();
  const probe = await probeGeometry(inner);
  const spec = SPECS[probe.type];
  if (!spec) {
    throw new Error(`unsupported geometry type for rendering: ${probe.type}`);
  }
  if (probe.count === 0) {
    clearDeck();
    return { featureCount: 0, timings: { queryMs: performance.now() - t0, parseMs: 0, bytes: 0 } };
  }

  const encoded =
    `SELECT ${spec.fn}(geom) AS geom FROM (${inner}) _q WHERE geom IS NOT NULL`;
  const { table, bytes } = await fetchArrow(encoded);
  const t1 = performance.now();

  const layers: Layer[] = [];
  table.batches.forEach((batch, i) => {
    if (batch.numRows === 0) return;
    const geom = batch.getChild("geom")?.data[0];
    if (!geom) return;
    layers.push(spec.layer(batch, geom, `geoarrow-${i}`));
  });

  const map = getMap();
  if (map) {
    ensureOverlay(map).setProps({ layers });
    fitToBounds(map, probe.bounds);
  }
  const t2 = performance.now();

  return {
    featureCount: probe.count,
    timings: { queryMs: t1 - t0, parseMs: t2 - t1, bytes },
  };
}

// One cheap round-trip for everything Run needs before choosing a layer: the
// geometry type (via any_value), the feature count, and the extent for fitBounds.
async function probeGeometry(innerSql: string): Promise<Probe> {
  const rows = await query(
    `SELECT ST_GeometryType(any_value(geom)) AS gt, COUNT(*) AS n,
            ST_XMin(ST_Extent_Agg(geom)) AS xmin, ST_YMin(ST_Extent_Agg(geom)) AS ymin,
            ST_XMax(ST_Extent_Agg(geom)) AS xmax, ST_YMax(ST_Extent_Agg(geom)) AS ymax
     FROM (${innerSql}) _q WHERE geom IS NOT NULL`,
  );
  const r = rows[0] ?? {};
  const count = Number(r.n ?? 0);
  const nums = [r.xmin, r.ymin, r.xmax, r.ymax].map(Number);
  const bounds = nums.every((v) => Number.isFinite(v))
    ? (nums as [number, number, number, number])
    : null;
  return { type: str(r.gt).toUpperCase(), count, bounds };
}

// Fetch a query's result as an Arrow IPC stream. `to_arrow_ipc` returns the
// stream split across a few BLOB rows (`ipc`), in order; concatenating them in
// row order yields a parseable stream.
async function fetchArrow(innerSql: string): Promise<{ table: Table; bytes: number }> {
  const rows = await query(`SELECT ipc FROM to_arrow_ipc((${innerSql}))`);
  const buffers = rows.map((r) => wkbBytes(r.ipc));
  const bytes = buffers.reduce((s, b) => s + b.byteLength, 0);
  const merged = new Uint8Array(bytes);
  let off = 0;
  for (const b of buffers) {
    merged.set(b, off);
    off += b.byteLength;
  }
  return { table: tableFromIPC(merged), bytes };
}

/** Remove the deck overlay's layers (used when switching render paths). */
export function clearDeck(): void {
  overlay?.setProps({ layers: [] });
}

function fitToBounds(map: maplibregl.Map, bounds: [number, number, number, number] | null): void {
  if (!bounds) return;
  const [xmin, ymin, xmax, ymax] = bounds;
  map.fitBounds(
    [
      [xmin, ymin],
      [xmax, ymax],
    ],
    { padding: 60, maxZoom: 14, duration: 600 },
  );
}
