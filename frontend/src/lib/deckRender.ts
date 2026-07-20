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
let rendered: { table: Table; spec: GeomSpec; source: string } | null = null;
// Whether the Run preview is drawn. The SQL-result temp layer (T-027) toggles
// this to hide/show without re-querying — selection and highlight state survive.
let renderedVisible = true;

// Persistent layers added from the catalog (T-024): each is an Arrow table +
// its geometry spec + a user-editable style (T-010), drawn with static
// (non-selection) colours and not pickable. Insertion order = draw order
// (oldest at the bottom), so a newly added layer stacks on top. Map insertion
// order gives us that for free.
interface AddedLayer {
  table: Table;
  spec: GeomSpec;
  style: LayerStyle;
  /** User-controlled visibility (the Layers-panel Eye toggle). */
  visible: boolean;
  /** Edit-time suppression (T-043): while a layer is edited in place, its
   *  read-only deck copy is hidden so it doesn't double-draw under the Terra Draw
   *  working set. Kept separate from `visible` so entering/leaving edit never
   *  clobbers the user's own show/hide state. A layer draws only when
   *  `visible && !suppressed`. */
  suppressed: boolean;
  /** The inner source query (projects `geom`), recorded so a picked feature can
   *  set it as the active selection source (T-041) for downstream tools. */
  source: string;
}
const added = new Map<string, AddedLayer>();

// Explicit bottom→top draw order for the added layers (T-031). When set, it is
// the single source of truth for z-order and overrides the Map's insertion
// order; the `layers` store drives it from its own list order. Null until the
// store first sets it — until then we fall back to insertion order (oldest
// bottom), which is the historical behaviour.
let drawOrder: string[] | null = null;

/**
 * Set the bottom→top stacking order of the added layers (T-031). Ids not
 * currently registered are ignored; any registered id missing from `ids` is
 * drawn on top (so a just-added layer never vanishes if the store hasn't
 * threaded it through yet). Re-syncs the overlay.
 */
export function setDeckLayerOrder(idsBottomToTop: string[]): void {
  drawOrder = idsBottomToTop;
  syncOverlay();
}

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

// A feature highlights only when it belongs to the active selection layer AND
// its fid is selected. Selection is scoped to one source at a time (T-041), so
// the source guard stops fid 1 in layer B lighting up because fid 1 in layer A
// (a different `__fid` space) is selected.
const isActiveSel = (source: string, fid: number): boolean =>
  selection.source() === source && selection.has(fid);

type Color = [number, number, number] | [number, number, number, number];
const colorAcc = (source: string, base: Color, sel: Color) =>
  ((info: FidInfo) => (isActiveSel(source, fidAt(info)) ? sel : base)) as never;
const numAcc = (source: string, base: number, sel: number) =>
  ((info: FidInfo) => (isActiveSel(source, fidAt(info)) ? sel : base)) as never;

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

// Read a picked feature's `__fid`. `getPickingInfo` sets `info.object` to the
// Arrow struct row; fall back to the cached table by batch index.
function fidFrom(info: PickingInfo, table: Table, batchIdx: number): number | null {
  const obj = info.object as Record<string, unknown> | null;
  const fromObj = obj?.[FID];
  if (fromObj != null) return Number(fromObj);
  if (info.index >= 0) {
    const v = table.batches[batchIdx]?.getChild(FID)?.get(info.index);
    if (v != null) return Number(v);
  }
  return null;
}

// Resolve a pick to its `__fid` *and* the source query of the layer it hit
// (T-041), so the selection can scope itself to that layer. The layer id encodes
// which render path was hit: `geoarrow-<i>` is the Run preview; `added-<id>-<i>`
// is a persistent added layer (ids are word-char only, so the trailing `-<i>`
// batch index is unambiguous).
function resolvePick(info: PickingInfo): { fid: number; source: string } | null {
  const id = info.layer?.id ?? "";
  const prev = /^geoarrow-(\d+)$/.exec(id);
  if (prev && rendered) {
    const fid = fidFrom(info, rendered.table, Number(prev[1]));
    return fid == null ? null : { fid, source: rendered.source };
  }
  const add = /^added-(.+)-(\d+)$/.exec(id);
  if (add) {
    const al = added.get(add[1]);
    if (al) {
      const fid = fidFrom(info, al.table, Number(add[2]));
      if (fid != null) return { fid, source: al.source };
    }
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
  const pick = info?.picked ? resolvePick(info) : null;
  if (!pick) {
    if (!additive) selection.clear();
    return;
  }
  selection.pick(pick.source, pick.fid, additive);
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
  /** Result extent [xmin,ymin,xmax,ymax] (lon/lat), null when empty/all-NULL —
   *  lets the SQL-result temp layer (T-027) support zoom-to like other layers. */
  bounds: [number, number, number, number] | null;
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
  layer: (batch: RecordBatch, geom: unknown, id: string, source: string) => Layer;
  // Builder for persistent added layers (T-024): base colours from the layer's
  // user-editable style (T-010), but pickable and selection-aware (T-041) —
  // selected features in the active layer highlight amber over the base style.
  staticLayer: (
    batch: RecordBatch,
    geom: unknown,
    id: string,
    source: string,
    s: LayerStyle,
  ) => Layer;
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
/** Geometry family a layer draws with — drives the Layers-panel symbology glyph
 *  (T-039). Collapses the Multi* probe types onto their base family. */
export type GeometryKind = "point" | "line" | "polygon";

/** Reduce a raw `ST_GeometryType` probe string to its symbology family. */
export function geometryKindOf(geomType: string): GeometryKind {
  if (geomType.includes("POINT")) return "point";
  if (geomType.includes("POLYGON")) return "polygon";
  return "line";
}

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

const POINT = (batch: RecordBatch, geom: unknown, id: string, source: string): Layer =>
  new GeoArrowScatterplotLayer({
    id,
    data: batch,
    getPosition: geom as never,
    pickable: true,
    getRadius: numAcc(source, 4, 6),
    radiusUnits: "pixels",
    getFillColor: colorAcc(source, [99, 102, 241, 200], SEL_FILL),
    stroked: true,
    getLineColor: colorAcc(source, [255, 255, 255, 255], SEL_LINE),
    lineWidthUnits: "pixels",
    getLineWidth: numAcc(source, 1, 2),
    updateTriggers: hiTriggers(),
  });

const PATH = (batch: RecordBatch, geom: unknown, id: string, source: string): Layer =>
  new GeoArrowPathLayer({
    id,
    data: batch,
    getPath: geom as never,
    pickable: true,
    getColor: colorAcc(source, [73, 74, 185, 255], SEL_LINE),
    widthUnits: "pixels",
    getWidth: numAcc(source, 2, 4),
    capRounded: true,
    jointRounded: true,
    updateTriggers: hiTriggers(),
  });

const POLYGON = (batch: RecordBatch, geom: unknown, id: string, source: string): Layer =>
  new GeoArrowPolygonLayer({
    id,
    data: batch,
    getPolygon: geom as never,
    pickable: true,
    filled: true,
    getFillColor: colorAcc(source, [99, 102, 241, 90], [255, 159, 28, 120]),
    stroked: true,
    getLineColor: colorAcc(source, [73, 74, 185, 255], SEL_LINE),
    getLineWidth: numAcc(source, 1, 2),
    lineWidthUnits: "pixels",
    // Triangulate on the main thread instead of fetching the earcut worker from
    // a CDN — deterministic and offline-safe. (Revisit with a self-hosted worker
    // if main-thread earcut becomes a bottleneck on very large polygon sets.)
    earcutWorkerUrl: null,
    updateTriggers: hiTriggers(),
  });

// Counterparts for persistent added layers (T-024): palette/style-coloured, and
// — since T-041 — pickable and selection-aware. Base colours come from the
// layer's editable style (T-010); a selected feature in the *active* layer draws
// amber over that base (the `source`-scoped accessors above).
const POINT_STATIC = (
  batch: RecordBatch,
  geom: unknown,
  id: string,
  source: string,
  s: LayerStyle,
): Layer =>
  new GeoArrowScatterplotLayer({
    id,
    data: batch,
    getPosition: geom as never,
    pickable: true,
    getRadius: numAcc(source, s.pointRadius, s.pointRadius + 2),
    radiusUnits: "pixels",
    getFillColor: colorAcc(source, rgba(s.fillColor, s.fillOpacity), SEL_FILL),
    stroked: true,
    getLineColor: colorAcc(source, opaque(s.lineColor), SEL_LINE),
    lineWidthUnits: "pixels",
    getLineWidth: numAcc(source, s.lineWidth, s.lineWidth + 1),
    updateTriggers: hiTriggers(),
  });

const PATH_STATIC = (
  batch: RecordBatch,
  geom: unknown,
  id: string,
  source: string,
  s: LayerStyle,
): Layer =>
  new GeoArrowPathLayer({
    id,
    data: batch,
    getPath: geom as never,
    pickable: true,
    getColor: colorAcc(source, rgba(s.lineColor, s.fillOpacity), SEL_LINE),
    widthUnits: "pixels",
    getWidth: numAcc(source, s.lineWidth, s.lineWidth + 2),
    capRounded: true,
    jointRounded: true,
    updateTriggers: hiTriggers(),
  });

const POLYGON_STATIC = (
  batch: RecordBatch,
  geom: unknown,
  id: string,
  source: string,
  s: LayerStyle,
): Layer =>
  new GeoArrowPolygonLayer({
    id,
    data: batch,
    getPolygon: geom as never,
    pickable: true,
    filled: true,
    getFillColor: colorAcc(source, rgba(s.fillColor, s.fillOpacity), SEL_FILL),
    stroked: true,
    getLineColor: colorAcc(source, opaque(s.lineColor), SEL_LINE),
    getLineWidth: numAcc(source, s.lineWidth, s.lineWidth + 1),
    lineWidthUnits: "pixels",
    earcutWorkerUrl: null, // main-thread earcut; offline-safe (see POLYGON above)
    updateTriggers: hiTriggers(),
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
    return {
      featureCount: 0,
      bounds: null,
      timings: { queryMs: performance.now() - t0, parseMs: 0, bytes: 0 },
    };
  }

  // Carry a deterministic `__fid` alongside the encoded geometry so picked
  // features resolve back to source rows (see selection.ts). `fidTaggedRelation`
  // is the single source of truth for how fids are assigned.
  const encoded =
    `SELECT ${FID}, ${spec.fn}(geom) AS geom FROM (${fidTaggedRelation(inner)}) _t`;
  const { table, bytes } = await fetchArrow(encoded);
  const t1 = performance.now();

  rendered = { table, spec, source: inner };
  renderedVisible = true; // a fresh Run is always shown, even if the last was hidden

  const map = getMap();
  if (map) {
    syncOverlay();
    fitToBounds(map, probe.bounds);
  }
  const t2 = performance.now();

  return {
    featureCount: probe.count,
    bounds: probe.bounds,
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
function buildLayers({ table, spec, source }: { table: Table; spec: GeomSpec; source: string }): Layer[] {
  const layers: Layer[] = [];
  table.batches.forEach((batch, i) => {
    if (batch.numRows === 0) return;
    const geom = batch.getChild("geom")?.data[0];
    if (!geom) return;
    layers.push(spec.layer(batch, geom, `geoarrow-${i}`, source));
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
  // Draw in the store-driven order when set (T-031), else Map insertion order.
  // Registered ids missing from `drawOrder` are appended last (on top) so a
  // freshly added layer is never dropped by a stale order list.
  const ids = drawOrder
    ? [
        ...drawOrder.filter((id) => added.has(id)),
        ...[...added.keys()].filter((id) => !drawOrder!.includes(id)),
      ]
    : [...added.keys()];
  for (const id of ids) {
    const al = added.get(id)!;
    if (!al.visible || al.suppressed) continue;
    al.table.batches.forEach((batch, i) => {
      if (batch.numRows === 0) return;
      const geom = batch.getChild("geom")?.data[0];
      if (!geom) return;
      layers.push(al.spec.staticLayer(batch, geom, `added-${id}-${i}`, al.source, al.style));
    });
  }
  if (rendered && renderedVisible) layers.push(...buildLayers(rendered));
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
  /** Geometry family (T-039), resolved once from the add-time probe so the
   *  Layers panel can draw a symbology glyph without re-probing per render. */
  geometryKind: GeometryKind;
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

  // Carry a deterministic `__fid` alongside the geometry (same tagging the Run
  // preview uses) so features picked on this layer resolve back to source rows
  // for downstream tools (T-041). `fidTaggedRelation` also applies the
  // `geom IS NOT NULL` filter, so no extra WHERE is needed here.
  const encoded = `SELECT ${FID}, ${spec.fn}(geom) AS geom FROM (${fidTaggedRelation(inner)}) _t`;
  const { table } = await fetchArrow(encoded);
  // Keep an existing layer's style on replace so its symbology stays stable.
  const style = added.get(id)?.style ?? nextStyle(probe.type);
  // Keep an existing layer's edit-suppression across a re-add (e.g. a commit
  // that re-renders the layer while still editing); default false on first add.
  const suppressed = added.get(id)?.suppressed ?? false;
  added.set(id, { table, spec, style, visible: true, suppressed, source: inner });
  syncOverlay();
  return {
    featureCount: probe.count,
    bounds: probe.bounds,
    style,
    geometryKind: geometryKindOf(probe.type),
  };
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

/**
 * Suppress/restore a layer's read-only deck copy for edit-in-place (T-043),
 * without touching the user `visible` flag. Called by the editing store when a
 * layer enters/leaves edit mode so its deck copy doesn't double-draw under the
 * Terra Draw working set. Idempotent; a no-op if the layer isn't rendered.
 */
export function setDeckLayerSuppressed(id: string, suppressed: boolean): void {
  const al = added.get(id);
  if (!al || al.suppressed === suppressed) return;
  al.suppressed = suppressed;
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
  renderedVisible = true;
  syncOverlay();
}

/** Show/hide the Run preview without re-querying (T-027 temp-layer visibility).
 *  Keeps `rendered` and its selection state intact so re-showing is instant. */
export function setPreviewVisible(visible: boolean): void {
  if (renderedVisible === visible) return;
  renderedVisible = visible;
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
