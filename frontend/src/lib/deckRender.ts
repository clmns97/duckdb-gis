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

// Hooks injected by the editing store (T-025) so the read-only render path stays
// a leaf module (no import of `editing`). `editGate` lets Terra Draw own map
// clicks while digitizing (deck must not pick/clear selection); `beforeIdFn`
// returns the MapLibre layer id the deck layers should render *beneath*, so the
// editable working set (a MapLibre-native source) draws on top of deck geometry.
let editGate: (() => boolean) | null = null;
let beforeIdFn: (() => string | undefined) | null = null;

/** Wire the editing store's gate + z-order provider into the render path. */
export function setDrawHooks(hooks: {
  isEditing: () => boolean;
  beforeId: () => string | undefined;
}): void {
  editGate = hooks.isEditing;
  beforeIdFn = hooks.beforeId;
  syncOverlay();
}

/** Let the editing store nudge deck to re-apply layer ordering when the Terra
 *  Draw layers appear or change (deck only re-syncs on its own mutations). */
export function requestSync(): void {
  syncOverlay();
}

// The SQL editor's Run preview: the last query result, kept so selection changes
// can rebuild its deck.gl layers (with updated highlight colors) without
// re-querying DuckDB. Composed *over* the persistent added layers (see `added`).
let rendered: { table: Table; spec: GeomSpec } | null = null;

// Persistent layers added from the catalog (T-024): each is an Arrow table +
// its geometry spec + a user-editable style (T-010), drawn with static
// (non-selection) colours and not pickable. Insertion order = draw order
// (oldest at the bottom), so a newly added layer stacks on top. Map insertion
// order gives us that for free.
interface AddedLayer {
  table: Table;
  spec: GeomSpec;
  style: LayerStyle;
  visible: boolean;
}
const added = new Map<string, AddedLayer>();

function ensureOverlay(map: maplibregl.Map): MapboxOverlay {
  if (overlay && overlayMap === map) return overlay;
  overlay = new MapboxOverlay({
    // Interleaved so deck layers share MapLibre's layer stack (T-025): the
    // editable working set (a MapLibre-native Terra Draw source) can then stack
    // *above* deck geometry. Ordering is enforced via each layer's `beforeId`
    // (see syncOverlay). The read-only GeoArrow path is otherwise unchanged.
    interleaved: true,
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
  // While a draw/edit mode is active, Terra Draw owns the click — don't pick or
  // clear the selection out from under it (T-025).
  if (editGate?.()) return;
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
// Re-syncs the whole overlay so the persistent added layers survive the rebuild.
selection.subscribe(() => {
  if (overlay) syncOverlay();
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
  // Selection-aware builder for the editor's Run preview (highlights picks).
  layer: (batch: RecordBatch, geom: unknown, id: string) => Layer;
  // Plain builder for persistent added layers (T-024): static colors from the
  // layer's user-editable style (T-010), not pickable, no coupling to the
  // single-source selection set.
  staticLayer: (batch: RecordBatch, geom: unknown, id: string, s: LayerStyle) => Layer;
}

// ---------------------------------------------------------------------------
// Per-layer symbology (T-010). The single-symbol style the Layer Properties ▸
// Symbology tab edits and the static layer factories below read. Colours are
// RGB; `fillOpacity` (0..1) is the fill/stroke alpha. Categorised / graduated
// (data-driven) styling is a later follow-up — this is one style per layer.
export interface LayerStyle {
  fillColor: [number, number, number]; // fill (points, polygons)
  lineColor: [number, number, number]; // stroke / line
  fillOpacity: number; // 0..1, applied to the fill and to line-only layers
  lineWidth: number; // px
  pointRadius: number; // px
}

// A per-layer colour pair seeding a new layer's default style: a fill and a
// matching darker stroke. Cycled so stacked layers are visually distinct.
interface Palette {
  fill: [number, number, number];
  line: [number, number, number];
}
const PALETTES: Palette[] = [
  { fill: [99, 102, 241], line: [73, 74, 185] }, // indigo (the Run-preview base)
  { fill: [16, 185, 129], line: [5, 150, 105] }, // emerald
  { fill: [244, 114, 182], line: [190, 24, 93] }, // pink
  { fill: [249, 115, 22], line: [194, 65, 12] }, // orange
  { fill: [56, 189, 248], line: [2, 132, 199] }, // sky
  { fill: [168, 85, 247], line: [126, 34, 206] }, // purple
];
let paletteTick = 0; // monotonic so removing a layer never recolours the others

// Seed a new layer's editable style (T-010) from the next palette. Opacity and
// widths lean on geometry type so polygons default translucent with a thin
// outline while points/lines read solid — the prior hardcoded look, now editable.
function nextStyle(geomType: string): LayerStyle {
  const p = PALETTES[paletteTick++ % PALETTES.length];
  const polygon = geomType.includes("POLYGON");
  return {
    fillColor: p.fill,
    lineColor: p.line,
    fillOpacity: polygon ? 0.35 : geomType.includes("POINT") ? 0.85 : 0.9,
    lineWidth: polygon ? 1 : 2,
    pointRadius: 4,
  };
}

const rgba = (c: [number, number, number], a: number): Color => [c[0], c[1], c[2], Math.round(a * 255)];
const opaque = (c: [number, number, number]): Color => [c[0], c[1], c[2], 255];

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

// Static counterparts for persistent added layers (T-024): palette-coloured,
// not pickable, no selection accessors — just draw the geometry.
const POINT_STATIC = (batch: RecordBatch, geom: unknown, id: string, s: LayerStyle): Layer =>
  new GeoArrowScatterplotLayer({
    id,
    data: batch,
    getPosition: geom as never,
    pickable: false,
    getRadius: s.pointRadius,
    radiusUnits: "pixels",
    getFillColor: rgba(s.fillColor, s.fillOpacity),
    stroked: true,
    getLineColor: opaque(s.lineColor),
    lineWidthUnits: "pixels",
    getLineWidth: s.lineWidth,
  });

const PATH_STATIC = (batch: RecordBatch, geom: unknown, id: string, s: LayerStyle): Layer =>
  new GeoArrowPathLayer({
    id,
    data: batch,
    getPath: geom as never,
    pickable: false,
    getColor: rgba(s.lineColor, s.fillOpacity),
    widthUnits: "pixels",
    getWidth: s.lineWidth,
    capRounded: true,
    jointRounded: true,
  });

const POLYGON_STATIC = (batch: RecordBatch, geom: unknown, id: string, s: LayerStyle): Layer =>
  new GeoArrowPolygonLayer({
    id,
    data: batch,
    getPolygon: geom as never,
    pickable: false,
    filled: true,
    getFillColor: rgba(s.fillColor, s.fillOpacity),
    stroked: true,
    getLineColor: opaque(s.lineColor),
    getLineWidth: s.lineWidth,
    lineWidthUnits: "pixels",
    earcutWorkerUrl: null, // main-thread earcut; offline-safe (see POLYGON above)
  });

const SPECS: Record<string, GeomSpec> = {
  POINT: { fn: "st_asgeoarrowpoint", layer: POINT, staticLayer: POINT_STATIC },
  MULTIPOINT: { fn: "st_asgeoarrowmultipoint", layer: POINT, staticLayer: POINT_STATIC },
  LINESTRING: { fn: "st_asgeoarrowlinestring", layer: PATH, staticLayer: PATH_STATIC },
  MULTILINESTRING: { fn: "st_asgeoarrowmultilinestring", layer: PATH, staticLayer: PATH_STATIC },
  POLYGON: { fn: "st_asgeoarrowpolygon", layer: POLYGON, staticLayer: POLYGON_STATIC },
  MULTIPOLYGON: { fn: "st_asgeoarrowmultipolygon", layer: POLYGON, staticLayer: POLYGON_STATIC },
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

  const map = getMap();
  if (map) {
    syncOverlay();
    fitToBounds(map, probe.bounds);
  }
  const t2 = performance.now();

  return {
    featureCount: probe.count,
    timings: { queryMs: t1 - t0, parseMs: t2 - t1, bytes },
  };
}

// One cheap round-trip for everything Run needs before choosing a layer: a
// representative geometry type, the feature count, and the extent for fitBounds.
// Deliberately uses per-row scalars (`ST_GeometryType`/`ST_XMin` … then plain
// `any_value`/`min`/`max`) rather than geometry-typed aggregates: combining
// `any_value(geom)` with `ST_Extent_Agg(geom)` over the same column throws a
// spurious "Only little-endian WKB is supported" in spatial for some geometries
// (hit by Overture buildings/polygons; the encoder decodes the same rows fine).
async function probeGeometry(innerSql: string): Promise<Probe> {
  const rows = await query(
    `SELECT any_value(ST_GeometryType(geom)) AS gt, COUNT(*) AS n,
            min(ST_XMin(geom)) AS xmin, min(ST_YMin(geom)) AS ymin,
            max(ST_XMax(geom)) AS xmax, max(ST_YMax(geom)) AS ymax
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

// Build one selection-aware deck.gl layer per non-empty Arrow batch from the
// editor's Run-preview result. The `geoarrow-<i>` ids are matched by pickFid.
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

// Compose the overlay's layer array: every persistent added layer (bottom,
// insertion order) then the editor's Run preview (top, pickable/highlighted).
// The single place layers reach the overlay, so both paths always coexist.
function syncOverlay(): void {
  const map = getMap();
  if (!map) return;
  let layers: Layer[] = [];
  for (const [id, al] of added) {
    if (!al.visible) continue;
    al.table.batches.forEach((batch, i) => {
      if (batch.numRows === 0) return;
      const geom = batch.getChild("geom")?.data[0];
      if (!geom) return;
      layers.push(al.spec.staticLayer(batch, geom, `added-${id}-${i}`, al.style));
    });
  }
  if (rendered) layers.push(...buildLayers(rendered));
  // Render deck geometry beneath the editable working set when one exists, so
  // drawn/edited features stay visible on top (T-025). No-op otherwise.
  // `beforeId` is honoured by MapboxOverlay in interleaved mode but isn't in
  // deck.gl's LayerProps type — cast past it.
  const beforeId = beforeIdFn?.();
  if (beforeId) layers = layers.map((l) => l.clone({ beforeId } as never));
  ensureOverlay(map).setProps({ layers });
}

export interface AddedLayerOutcome {
  featureCount: number;
  bounds: [number, number, number, number] | null;
  /** The default style seeded for this layer (T-010), so the store can mirror
   *  it for the Symbology UI. On re-add of an existing id the current style is
   *  kept. */
  style: LayerStyle;
}

/**
 * Register a persistent layer from a source relation (must expose a `geom`
 * column) and draw it on the overlay, stacked over any existing added layers.
 * Probes the geometry type, encodes it to GeoArrow, and returns the feature
 * count + extent so the caller can frame the map. Re-adding the same `id`
 * replaces it. Not selection-coupled — see `renderGeoArrow` for the pickable path.
 */
export async function addDeckLayer(id: string, sourceSql: string): Promise<AddedLayerOutcome> {
  const inner = clean(sourceSql);
  const probe = await probeGeometry(inner);
  const spec = SPECS[probe.type];
  if (!spec) throw new Error(`unsupported geometry type for rendering: ${probe.type}`);

  const encoded = `SELECT ${spec.fn}(geom) AS geom FROM (${inner}) _t WHERE geom IS NOT NULL`;
  const { table } = await fetchArrow(encoded);
  // Keep an existing layer's style on replace so its symbology stays stable.
  const style = added.get(id)?.style ?? nextStyle(probe.type);
  added.set(id, { table, spec, style, visible: true });
  syncOverlay();
  return { featureCount: probe.count, bounds: probe.bounds, style };
}

/** Drop a persistent added layer from the overlay. */
export function removeDeckLayer(id: string): void {
  if (added.delete(id)) syncOverlay();
}

/** Show/hide a persistent added layer without re-querying. */
export function setDeckLayerVisible(id: string, visible: boolean): void {
  const al = added.get(id);
  if (!al || al.visible === visible) return;
  al.visible = visible;
  syncOverlay();
}

/** Re-style a persistent added layer live (T-010) without re-querying. */
export function setDeckLayerStyle(id: string, style: LayerStyle): void {
  const al = added.get(id);
  if (!al) return;
  al.style = style;
  syncOverlay();
}

/** Clear only the editor's Run preview; persistent added layers are kept. */
export function clearDeck(): void {
  rendered = null;
  syncOverlay();
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
