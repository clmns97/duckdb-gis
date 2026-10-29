import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";
import {
  GeoArrowScatterplotLayer,
  GeoArrowPathLayer,
  GeoArrowPolygonLayer,
} from "@geoarrow/deck.gl-geoarrow";
import { Table, makeVector, type RecordBatch, type Vector } from "apache-arrow";
import { query, queryArrow, str } from "./duckdb";
import { wkbToGeoArrow } from "./wkb";
import { getMap, fitBounds } from "./mapBus";
import { selection, FID, fidTaggedRelation, cleanSql } from "./selection";
import type { PickingInfo } from "@deck.gl/core";

// ---------------------------------------------------------------------------
// Unified GeoArrow render path. DuckDB returns geometry as WKB in an Arrow IPC
// stream; lib/wkb.ts decodes it into native GeoArrow memory layout (STRUCT(x,y)
// coords nested by LIST), handed straight to the GeoArrow deck.gl layers
// — which triangulate/tesselate on the GPU with zero per-row JS objects. Run
// probes the geometry type first and dispatches to the matching layer.
// ---------------------------------------------------------------------------


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
let rendered: { table: Table; kind: GeometryKind; source: string } | null = null;
// Whether the Run preview is drawn. The SQL-result temp layer (T-027) toggles
// this to hide/show without re-querying — selection and highlight state survive.
let renderedVisible = true;

// Persistent layers added from the catalog (T-024): each is an Arrow table +
// its geometry family + a user-editable style (T-010), drawn with static
// (non-selection) colours and not pickable. Insertion order = draw order
// (oldest at the bottom), so a newly added layer stacks on top. Map insertion
// order gives us that for free.
interface AddedLayer {
  table: Table;
  kind: GeometryKind;
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
// Each batch's `__fid` column, looked up once rather than by name per feature.
const fidColumns = new WeakMap<RecordBatch, Vector>();
const fidAt = (info: FidInfo): number => {
  const batch = info.data.data;
  let fids = fidColumns.get(batch);
  if (!fids) {
    fids = batch.getChild(FID)!;
    fidColumns.set(batch, fids);
  }
  return Number(fids.get(info.index));
};

// A feature highlights only when it belongs to the active selection layer AND
// its fid is selected. Selection is scoped to one source at a time (T-041), so
// the source guard stops fid 1 in layer B lighting up because fid 1 in layer A
// (a different `__fid` space) is selected.
const isActiveSel = (source: string, fid: number): boolean =>
  selection.source() === source && selection.has(fid);

// With nothing selected in this layer (always so right after a Run), hand deck.gl
// the plain value: a constant attribute instead of an accessor called per
// feature. Layers are rebuilt on every selection change, so this re-evaluates.
const hasActiveSel = (source: string): boolean =>
  selection.size > 0 && selection.source() === source;

type Color = [number, number, number] | [number, number, number, number];
const acc = <T extends Color | number>(source: string, base: T, sel: T) =>
  (hasActiveSel(source)
    ? (info: FidInfo) => (isActiveSel(source, fidAt(info)) ? sel : base)
    : base) as never;

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
  queryMs: number; // DuckDB round-trips (probe + geometry fetch) and WKB decoding
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

// Maps a DuckDB geometry type to its layer factories. Single and Multi variants
// of a family share a layer (the GeoArrow layers accept both
// PointData/MultiPointData, Polygon/MultiPolygon, …).
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

// One deck.gl layer factory per geometry family. Base colours come from a
// LayerStyle; a selected feature in the active layer draws amber over it (the
// `source`-scoped accessors above). Persistent added layers (T-024) pass their
// editable style (T-010); the Run preview passes PREVIEW_STYLE.
type LayerFactory = (
  batch: RecordBatch,
  geom: unknown,
  id: string,
  source: string,
  s: LayerStyle,
  selFill?: Color,
) => Layer;

const FACTORIES: Record<GeometryKind, LayerFactory> = {
  point: (batch, geom, id, source, s, selFill = SEL_FILL) =>
    new GeoArrowScatterplotLayer({
      id,
      data: batch,
      getPosition: geom as never,
      pickable: true,
      getRadius: acc(source, s.pointRadius, s.pointRadius + 2),
      radiusUnits: "pixels",
      getFillColor: acc(source, rgba(s.fillColor, s.fillOpacity), selFill),
      stroked: true,
      getLineColor: acc(source, opaque(s.lineColor), SEL_LINE),
      lineWidthUnits: "pixels",
      getLineWidth: acc(source, s.lineWidth, s.lineWidth + 1),
      updateTriggers: hiTriggers(),
    }),
  line: (batch, geom, id, source, s) =>
    new GeoArrowPathLayer({
      id,
      data: batch,
      getPath: geom as never,
      pickable: true,
      getColor: acc(source, rgba(s.lineColor, s.fillOpacity), SEL_LINE),
      widthUnits: "pixels",
      getWidth: acc(source, s.lineWidth, s.lineWidth + 2),
      capRounded: true,
      jointRounded: true,
      updateTriggers: hiTriggers(),
    }),
  polygon: (batch, geom, id, source, s, selFill = SEL_FILL) =>
    new GeoArrowPolygonLayer({
      id,
      data: batch,
      getPolygon: geom as never,
      pickable: true,
      filled: true,
      getFillColor: acc(source, rgba(s.fillColor, s.fillOpacity), selFill),
      stroked: true,
      getLineColor: acc(source, opaque(s.lineColor), SEL_LINE),
      getLineWidth: acc(source, s.lineWidth, s.lineWidth + 1),
      lineWidthUnits: "pixels",
      // Triangulate on the main thread instead of fetching the earcut worker from
      // a CDN — deterministic and offline-safe. (Revisit with a self-hosted worker
      // if main-thread earcut becomes a bottleneck on very large polygon sets.)
      earcutWorkerUrl: null,
      updateTriggers: hiTriggers(),
    }),
};

// The Run preview's fixed look, per family: indigo, white-ringed points, and a
// lighter amber when a preview polygon is selected (PREVIEW_POLYGON_SEL_FILL).
const INDIGO: [number, number, number] = [99, 102, 241];
const INDIGO_DARK: [number, number, number] = [73, 74, 185];
const PREVIEW_STYLE: Record<GeometryKind, LayerStyle> = {
  point: {
    fillColor: INDIGO,
    lineColor: [255, 255, 255],
    fillOpacity: 200 / 255,
    lineWidth: 1,
    pointRadius: 4,
  },
  line: { fillColor: INDIGO, lineColor: INDIGO_DARK, fillOpacity: 1, lineWidth: 2, pointRadius: 4 },
  polygon: {
    fillColor: INDIGO,
    lineColor: INDIGO_DARK,
    fillOpacity: 90 / 255,
    lineWidth: 1,
    pointRadius: 4,
  },
};
const PREVIEW_POLYGON_SEL_FILL: Color = [255, 159, 28, 120];

// One layer per non-empty Arrow batch of a GeoArrow table. `idPrefix` + batch
// index is what resolvePick parses back (`geoarrow-<i>` / `added-<id>-<i>`).
function batchLayers(
  table: Table,
  idPrefix: string,
  make: (batch: RecordBatch, geom: unknown, id: string) => Layer,
): Layer[] {
  const out: Layer[] = [];
  table.batches.forEach((batch, i) => {
    const geom = batch.numRows > 0 ? batch.getChild("geom")?.data[0] : undefined;
    if (geom) out.push(make(batch, geom, `${idPrefix}${i}`));
  });
  return out;
}

/**
 * Run a user query and render its geometry through the matching GeoArrow layer.
 * Dispatches on the result's geometry type (point → Scatterplot, line → Path,
 * polygon → Polygon).
 */
export async function renderGeoArrow(userSql: string): Promise<DeckOutcome> {
  const inner = cleanSql(userSql);

  const t0 = performance.now();
  const probe = await probeGeometry(inner);
  const kind = geometryKindOf(probe.type);
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

  const { table, bytes } = await fetchGeoArrow(inner, kind);
  const t1 = performance.now();

  rendered = { table, kind, source: inner };
  renderedVisible = true; // a fresh Run is always shown, even if the last was hidden

  const map = getMap();
  if (map) {
    syncOverlay();
    fitBounds(probe.bounds);
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
  assertPlausibleWgs84(bounds);
  return { type: str(r.gt).toUpperCase(), count, bounds };
}

// #65/ADR-0003, tier 2: an extent outside WGS84's legal range can only mean
// the coordinates aren't lon/lat at all — most likely an unannotated
// projected CRS (UTM, a national grid, Web Mercator metres) `layers.ts`
// couldn't reproject because DuckDB has no CRS metadata to reproject *from*.
// Refuse before anything reaches the deck overlay or the camera, with a
// specific explanation, rather than rendering first and letting MapLibre's
// own `fitBounds` throw a generic "Invalid LngLat" error after the fact (the
// previous, accidental, latitude-only-and-inconsistent behaviour — verified
// live before this fix). Shared by every render path (`addDeckLayer`,
// `renderGeoArrow`), so this is the one guarantee every path gets for free
// regardless of how its SQL was built.
function assertPlausibleWgs84(bounds: [number, number, number, number] | null): void {
  if (!bounds) return;
  const [xmin, ymin, xmax, ymax] = bounds;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) {
    throw new Error(
      `Geometry is outside the valid WGS84 (lon/lat) range — extent is ` +
        `[${xmin.toFixed(1)}, ${ymin.toFixed(1)}, ${xmax.toFixed(1)}, ${ymax.toFixed(1)}]. ` +
        `This looks like a projected coordinate system (e.g. UTM), not WGS84. ` +
        `duckdb-gis can reproject automatically when a column's CRS is known ` +
        `(#65) — otherwise, reproject the source data to WGS84 first.`,
    );
  }
}

// Fetch a relation's features as a deterministic `__fid` (so picked features
// resolve back to source rows; `fidTaggedRelation` is the single source of
// truth for how fids are assigned, and drops NULL geometries) plus native
// GeoArrow geometry. DuckDB sends WKB (`ST_AsWKB`, from `spatial` on every
// DuckDB we support) and lib/wkb.ts decodes it: no duck_geoarrow extension.
// `ST_Multi` folds a family's simple rows onto its multi variant (a no-op on
// already-multi ones) so a query can mix POLYGON/MULTIPOLYGON etc.
async function fetchGeoArrow(
  inner: string,
  kind: GeometryKind,
): Promise<{ table: Table; bytes: number }> {
  const { table, bytes } = await queryArrow(
    `SELECT ${FID}, ST_AsWKB(ST_Multi(geom)) AS geom FROM (${fidTaggedRelation(inner)}) _t`,
  );
  const geom = wkbToGeoArrow(table.getChild("geom")!, kind);
  // One contiguous batch, so the overlay draws one layer per family rather than
  // one per result batch (DuckDB returns batches of 2048 rows).
  const fids = makeVector(table.getChild(FID)!.toArray() as BigInt64Array);
  return { table: new Table({ [FID]: fids, geom }), bytes };
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
    const make = FACTORIES[al.kind];
    layers.push(
      ...batchLayers(al.table, `added-${id}-`, (b, g, lid) => make(b, g, lid, al.source, al.style)),
    );
  }
  if (rendered && renderedVisible) {
    const { table, kind, source } = rendered;
    const selFill = kind === "polygon" ? PREVIEW_POLYGON_SEL_FILL : undefined;
    layers.push(
      ...batchLayers(table, "geoarrow-", (b, g, lid) =>
        FACTORIES[kind](b, g, lid, source, PREVIEW_STYLE[kind], selFill),
      ),
    );
  }
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
  const inner = cleanSql(sourceSql);
  const probe = await probeGeometry(inner);
  const kind = geometryKindOf(probe.type);

  // Same `__fid` tagging as the Run preview, so features picked on this layer
  // resolve back to source rows for downstream tools (T-041).
  const { table } = await fetchGeoArrow(inner, kind);
  // Keep an existing layer's style on replace so its symbology stays stable.
  const style = added.get(id)?.style ?? nextStyle(probe.type);
  // Keep an existing layer's edit-suppression across a re-add (e.g. a commit
  // that re-renders the layer while still editing); default false on first add.
  const suppressed = added.get(id)?.suppressed ?? false;
  added.set(id, { table, kind, style, visible: true, suppressed, source: inner });
  syncOverlay();
  return {
    featureCount: probe.count,
    bounds: probe.bounds,
    style,
    geometryKind: kind,
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
