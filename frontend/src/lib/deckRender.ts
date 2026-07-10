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
import { selection, FID, fidTaggedRelation } from "./selection";
import type { PickingInfo } from "@deck.gl/core";

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

// The last rendered result, kept so selection changes can rebuild the deck.gl
// layers (with updated highlight colors) without re-querying DuckDB.
let rendered: { table: Table; spec: GeomSpec } | null = null;

function ensureOverlay(map: maplibregl.Map): MapboxOverlay {
  if (overlay && overlayMap === map) return overlay;
  overlay = new MapboxOverlay({
    interleaved: false,
    layers: [],
    // Click a feature to select it; shift-click adds/removes; clicking empty
    // map clears. Picking info comes from the GeoArrow layers (pickable below).
    onClick: handleClick,
  });
  map.addControl(overlay);
  overlayMap = map;
  return overlay;
}

// ---------------------------------------------------------------------------
// Selection picking + highlight.
// GeoArrow function accessors are invoked as `fn({ index, data, target })`
// where `data.data` is the RecordBatch and `index` is the (multi-geometry
// inverted) feature index — so we can read the feature's `__fid` and colour it
// as selected or not. `updateTriggers` keyed on `selection.version` forces
// deck.gl to re-evaluate the accessors when the selection changes.
// ---------------------------------------------------------------------------
interface FidInfo {
  index: number;
  data: { data: RecordBatch };
}
const fidAt = (info: FidInfo): number =>
  Number(info.data.data.getChild(FID)?.get(info.index));

type Color = [number, number, number] | [number, number, number, number];
const colorAcc = (base: Color, sel: Color) =>
  ((info: FidInfo) => (selection.has(fidAt(info)) ? sel : base)) as never;
const numAcc = (base: number, sel: number) =>
  ((info: FidInfo) => (selection.has(fidAt(info)) ? sel : base)) as never;

// `updateTriggers` value shared by every highlight accessor.
const hiTriggers = () => {
  const v = selection.version;
  return {
    getFillColor: v,
    getLineColor: v,
    getLineWidth: v,
    getRadius: v,
    getColor: v,
    getWidth: v,
  };
};

// Resolve a picked feature to its `__fid`. `getPickingInfo` sets `info.object`
// to the Arrow struct row; fall back to the cached table by layer/batch index.
function pickFid(info: PickingInfo): number | null {
  const obj = info.object as Record<string, unknown> | null;
  const fromObj = obj?.[FID];
  if (fromObj != null) return Number(fromObj);
  const m = /geoarrow-(\d+)/.exec(info.layer?.id ?? "");
  if (m && rendered && info.index >= 0) {
    const batch = rendered.table.batches[Number(m[1])];
    const v = batch?.getChild(FID)?.get(info.index);
    if (v != null) return Number(v);
  }
  return null;
}

// deck.gl's mjolnir `click` event does not reliably carry the Shift modifier
// (`srcEvent.shiftKey` comes through undefined), so track it at the document
// level instead. Shift-click is our additive-selection gesture.
let shiftHeld = false;
if (typeof window !== "undefined") {
  const sync = (e: KeyboardEvent) => {
    if (e.key === "Shift") shiftHeld = e.type === "keydown";
  };
  window.addEventListener("keydown", sync);
  window.addEventListener("keyup", sync);
  window.addEventListener("blur", () => {
    shiftHeld = false;
  });
}

function handleClick(info: PickingInfo, event: { srcEvent?: { shiftKey?: boolean } }): void {
  const additive = Boolean(event?.srcEvent?.shiftKey) || shiftHeld;
  const fid = info?.picked ? pickFid(info) : null;
  if (fid == null) {
    if (!additive) selection.clear();
    return;
  }
  if (additive) selection.toggle(fid);
  else selection.set([fid]);
}

// Rebuild layers in place when the selection changes (no DuckDB round-trip).
selection.subscribe(() => {
  if (overlay && rendered) overlay.setProps({ layers: buildLayers(rendered) });
});

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

// Amber highlight for selected features, over the indigo base palette.
const SEL_FILL: Color = [255, 159, 28, 230];
const SEL_LINE: Color = [217, 119, 6, 255];

const POINT = (batch: RecordBatch, geom: unknown, id: string): Layer =>
  new GeoArrowScatterplotLayer({
    id,
    data: batch,
    getPosition: geom as never,
    pickable: true,
    getRadius: numAcc(4, 6),
    radiusUnits: "pixels",
    getFillColor: colorAcc([99, 102, 241, 200], SEL_FILL),
    stroked: true,
    getLineColor: colorAcc([255, 255, 255, 255], SEL_LINE),
    lineWidthUnits: "pixels",
    getLineWidth: numAcc(1, 2),
    updateTriggers: hiTriggers(),
  });

const PATH = (batch: RecordBatch, geom: unknown, id: string): Layer =>
  new GeoArrowPathLayer({
    id,
    data: batch,
    getPath: geom as never,
    pickable: true,
    getColor: colorAcc([73, 74, 185, 255], SEL_LINE),
    widthUnits: "pixels",
    getWidth: numAcc(2, 4),
    capRounded: true,
    jointRounded: true,
    updateTriggers: hiTriggers(),
  });

const POLYGON = (batch: RecordBatch, geom: unknown, id: string): Layer =>
  new GeoArrowPolygonLayer({
    id,
    data: batch,
    getPolygon: geom as never,
    pickable: true,
    filled: true,
    getFillColor: colorAcc([99, 102, 241, 90], [255, 159, 28, 120]),
    stroked: true,
    getLineColor: colorAcc([73, 74, 185, 255], SEL_LINE),
    getLineWidth: numAcc(1, 2),
    lineWidthUnits: "pixels",
    // Triangulate on the main thread instead of fetching the earcut worker from
    // a CDN — deterministic and offline-safe. (Revisit with a self-hosted worker
    // if main-thread earcut becomes a bottleneck on very large polygon sets.)
    earcutWorkerUrl: null,
    updateTriggers: hiTriggers(),
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
  // New render → new feature-id space; drop any stale selection and record the
  // source query so a downstream tool can rebuild these exact features.
  selection.setSource(inner);

  if (probe.count === 0) {
    clearDeck();
    return { featureCount: 0, timings: { queryMs: performance.now() - t0, parseMs: 0, bytes: 0 } };
  }

  // Carry a deterministic `__fid` alongside the encoded geometry so picked
  // features resolve back to source rows (see selection.ts). `fidTaggedRelation`
  // is the single source of truth for how fids are assigned.
  const encoded =
    `SELECT ${FID}, ${spec.fn}(geom) AS geom FROM (${fidTaggedRelation(inner)}) _t`;
  const { table, bytes } = await fetchArrow(encoded);
  const t1 = performance.now();

  rendered = { table, spec };
  const layers = buildLayers(rendered);

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

// Build one deck.gl layer per non-empty Arrow batch from a rendered result.
function buildLayers({ table, spec }: { table: Table; spec: GeomSpec }): Layer[] {
  const layers: Layer[] = [];
  table.batches.forEach((batch, i) => {
    if (batch.numRows === 0) return;
    const geom = batch.getChild("geom")?.data[0];
    if (!geom) return;
    layers.push(spec.layer(batch, geom, `geoarrow-${i}`));
  });
  return layers;
}

/** Remove the deck overlay's layers (used when switching render paths). */
export function clearDeck(): void {
  rendered = null;
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
