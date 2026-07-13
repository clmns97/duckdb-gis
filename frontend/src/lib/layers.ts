// ---------------------------------------------------------------------------
// Active-layers store (T-021, render path rewired in T-024).
//
// The minimal app-level model of "a layer added to the map" — the store the
// Layers panel renders from and the map draws. It is the foundation later layer
// work builds on: styling (T-010), info/metadata (T-011), zoom-to (T-022).
//
// Design (mirrors `selection.ts`): a standalone subscribable store rather than
// React context threaded everywhere. Components read `list()` in render and
// subscribe to `version` (a scalar snapshot) via `useSyncExternalStore` — the
// same shape `SelectionChip` uses — so a fresh array from `list()` never trips
// the snapshot-identity check.
//
// Render path: the **Arrow/deck** overlay (`deckRender.ts`), not ST_AsMVT tiles.
// Benchmarking showed Arrow is dramatically faster for these table sizes and
// over high-latency links, and dropping the per-layer materialise step erases
// the `<id>_tiles` catalog-pollution problem (T-023) entirely. The overlay now
// *stacks* several persistent layers (`addDeckLayer`), so each added table draws
// as its own layer without a MapLibre source or a materialised copy.
// ---------------------------------------------------------------------------

import { getMap } from "./mapBus";
import { query, str } from "./duckdb";
import { addDeckLayer, removeDeckLayer, setDeckLayerStyle, type LayerStyle } from "./deckRender";

export type { LayerStyle };

/** A concrete geometry column in the catalog: the source of one layer. */
export interface LayerSource {
  db: string;
  schema: string;
  table: string;
  geomColumn: string;
}

export interface ActiveLayer {
  /** Stable id: also the MVT layer/source id and the dedupe key. */
  id: string;
  /** Display name shown in the Layers panel. */
  name: string;
  /** The catalog source, when the layer is a catalog table. Absent for a
   *  query-backed layer (Overture quick-load T-012; later the SQL editor T-005). */
  source?: LayerSource;
  /** Modelled now for T-010 styling; the panel does not toggle it yet. */
  visible: boolean;
  status: "loading" | "ready" | "error";
  error?: string;
  /** Full extent [xmin,ymin,xmax,ymax] (lon/lat) from the add-time geometry
   *  probe, reused by "Zoom to layer" (T-022). Null when the layer is empty /
   *  all-NULL geometry, or not yet loaded. */
  bounds?: [number, number, number, number] | null;
  /** Editable symbology (T-010), mirrored from the render layer so the Layer
   *  Properties ▸ Symbology tab can drive it. Present once the layer is ready. */
  style?: LayerStyle;
}

type Listener = () => void;

const byId = new Map<string, ActiveLayer>();
let order: string[] = []; // newest first — mirrors map draw order (last added on top)
let version = 0;
const listeners = new Set<Listener>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualified(s: LayerSource): string {
  return `${ident(s.db)}.${ident(s.schema)}.${ident(s.table)}`;
}

// Stable, SQL/URL-safe id derived from the fully-qualified source tuple. The
// same (table, column) always yields the same id, which is also how we dedupe.
// Word-char-only so it is safe as a MapLibre layer id and an unquoted table name.
function layerId(s: LayerSource): string {
  return `L_${[s.db, s.schema, s.table, s.geomColumn].join("__").replace(/[^A-Za-z0-9]/g, "_")}`;
}

function snapshot(): ActiveLayer[] {
  return order.map((id) => byId.get(id)!);
}

function patch(id: string, changes: Partial<ActiveLayer>): void {
  const layer = byId.get(id);
  if (!layer) return;
  byId.set(id, { ...layer, ...changes });
  emit();
}

// Frame the map on a freshly added layer so it is actually visible (the deck
// overlay draws where the geometry is but does not move the camera). Bounds come
// back from `addDeckLayer`'s geometry probe (lon/lat), feeding map.fitBounds
// directly. A dedicated per-layer "zoom to" gesture is T-022; this is add-time framing.
function fitTo(bounds: [number, number, number, number] | null): void {
  const map = getMap();
  if (!map || !bounds) return;
  const [xmin, ymin, xmax, ymax] = bounds;
  map.fitBounds(
    [
      [xmin, ymin],
      [xmax, ymax],
    ],
    { padding: 60, maxZoom: 14, duration: 600 },
  );
}

export const layers = {
  list: snapshot,
  /** Scalar snapshot for `useSyncExternalStore`. */
  get version(): number {
    return version;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /**
   * Add a catalog table to the map as a tracked layer. Idempotent per
   * (table, geometry column): re-adding the same source is a no-op (dedupe).
   *
   * Renders the geometry column straight through the Arrow/deck overlay
   * (`addDeckLayer`) — no materialised copy — then frames the map on the extent
   * the render returned. The layer stacks over any others already on the map.
   */
  async add(source: LayerSource): Promise<void> {
    const id = layerId(source);
    if (byId.has(id)) return; // dedupe: this exact table+column is already a layer

    byId.set(id, { id, name: source.table, source, visible: true, status: "loading" });
    order = [id, ...order];
    emit();

    try {
      const sql = `SELECT ${ident(source.geomColumn)} AS geom FROM ${qualified(source)}`;
      const { bounds, style } = await addDeckLayer(id, sql);
      patch(id, { status: "ready", bounds, style });
      fitTo(bounds);
    } catch (e) {
      patch(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  /**
   * Add a layer from an arbitrary geometry query rather than a catalog table —
   * the Overture quick-load (T-012), and later the SQL editor (T-005), use this.
   * The caller owns `id` (the dedupe key) and the display `name`; `sql` must
   * project a `geom` column. Same loading/ready/error lifecycle as `add`.
   */
  async addQuery(opts: { id: string; name: string; sql: string }): Promise<void> {
    const { id, name, sql } = opts;
    if (byId.has(id)) return; // dedupe: a layer with this id is already present

    byId.set(id, { id, name, visible: true, status: "loading" });
    order = [id, ...order];
    emit();

    try {
      const { bounds, style } = await addDeckLayer(id, sql);
      patch(id, { status: "ready", bounds, style });
      fitTo(bounds);
    } catch (e) {
      patch(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  /**
   * Update a layer's symbology (T-010): merge `changes` into its style, push it
   * to the render layer live, and notify subscribers so the Symbology UI stays
   * in sync. No-op if the layer is unknown or not yet styled (still loading).
   */
  setStyle(id: string, changes: Partial<LayerStyle>): void {
    const layer = byId.get(id);
    if (!layer?.style) return;
    const style = { ...layer.style, ...changes };
    setDeckLayerStyle(id, style);
    patch(id, { style });
  },

  /**
   * Frame the map on a layer's full extent — QGIS's "Zoom to Layer(s)"
   * (T-022). Reuses the extent captured at add time (lon/lat, the same probe
   * that framed the layer on add), so no re-query is needed and it works for
   * query-backed layers too. A no-op when the layer is unknown, still loading,
   * or has no valid extent (empty / all-NULL geometry). `fitTo` clamps maxZoom,
   * so a single-point / zero-area extent lands at a sensible zoom, not slammed in.
   */
  zoomTo(id: string): void {
    const layer = byId.get(id);
    if (!layer) return;
    fitTo(layer.bounds ?? null);
  },

  /** Remove a layer from the map (drops it from the deck overlay). */
  remove(id: string): void {
    if (!byId.has(id)) return;
    removeDeckLayer(id);
    byId.delete(id);
    order = order.filter((x) => x !== id);
    emit();
  },
};

export type Layers = typeof layers;

// ---------------------------------------------------------------------------
// Layer information (T-011). The read-only "Information / Metadata" side of
// QGIS's Layer Properties. Computed on demand (the count/extent probe can be
// costly on large tables) rather than eagerly on selection.
// ---------------------------------------------------------------------------

export interface LayerColumn {
  name: string;
  type: string;
}

export interface LayerInfo {
  /** Attribute columns + their DuckDB types. */
  columns: LayerColumn[];
  /** Total rows in the source table; null when not derivable (query-backed). */
  featureCount: number | null;
  /** Representative geometry type (ST_GeometryType); null when unknown. */
  geometryType: string | null;
  /** Extent [xmin,ymin,xmax,ymax] (lon/lat), from the add-time probe. */
  bounds: [number, number, number, number] | null;
  /** CRS is unknown for plain GEOMETRY today; shown as such (T-011). */
  crs: string | null;
  /** True for a catalog-table layer; false for a query-backed layer (Overture /
   *  SQL editor) whose attributes/count we don't resolve without re-running it. */
  fromSource: boolean;
}

/**
 * Load the Information/Metadata for a layer. For a catalog-table layer this
 * probes columns (from `duckdb_columns()`) plus feature count + geometry type
 * in one round-trip; the extent reuses the add-time bounds. Query-backed layers
 * return what's known (name/extent) with the rest left null.
 */
export async function loadLayerInfo(layer: ActiveLayer): Promise<LayerInfo> {
  const base: LayerInfo = {
    columns: [],
    featureCount: null,
    geometryType: null,
    bounds: layer.bounds ?? null,
    crs: null,
    fromSource: Boolean(layer.source),
  };
  const s = layer.source;
  if (!s) return base;

  const [colRows, statRows] = await Promise.all([
    query(
      `SELECT column_name AS name, data_type AS type
         FROM duckdb_columns()
        WHERE database_name = '${sqlLit(s.db)}'
          AND schema_name = '${sqlLit(s.schema)}'
          AND table_name = '${sqlLit(s.table)}'
        ORDER BY column_index`,
    ),
    query(
      `SELECT count(*) AS n,
              ST_GeometryType(any_value(${ident(s.geomColumn)})
                FILTER (WHERE ${ident(s.geomColumn)} IS NOT NULL)) AS gt
         FROM ${qualified(s)}`,
    ),
  ]);

  const stat = statRows[0] ?? {};
  return {
    ...base,
    columns: colRows.map((r) => ({ name: str(r.name), type: str(r.type) })),
    featureCount: Number(stat.n ?? 0),
    geometryType: stat.gt == null ? null : str(stat.gt),
  };
}

/** Escape a single-quoted SQL string literal. */
function sqlLit(v: string): string {
  return v.replace(/'/g, "''");
}
