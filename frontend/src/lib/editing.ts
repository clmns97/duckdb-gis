// ---------------------------------------------------------------------------
// Editing / digitizing store (T-025).
//
// The second of the two-representation model: the read-only render path
// (`deckRender.ts`, GeoArrow → deck.gl, immutable columnar buffers) can't do
// vertex editing, so the *editable working set* lives on a MapLibre-native
// GeoJSON source driven by Terra Draw. Terra Draw renders through the shared
// `maplibregl.Map` (`mapBus.getMap()`), interleaved with the deck overlay, and
// owns all the digitizing interaction (draw point/line/polygon, drag/insert/
// delete vertices, delete features).
//
// On Commit the working-set GeoJSON is written back into DuckDB natively
// (`ST_GeomFromGeoJSON` + `CREATE TABLE`) and re-rendered through the normal
// GeoArrow path (`layers.addQuery`) — no Python sidecar, the in-process DuckDB
// does the write.
//
// Store shape mirrors `selection.ts` / `layers.ts`: a module-level singleton
// with a `version` scalar + `subscribe`, read from React via
// `useSyncExternalStore`. It imports `deckRender` (to inject the edit gate +
// z-order hook) and `layers` (to re-render on commit); `deckRender` does NOT
// import this module — the coupling is one-directional via `setDrawHooks`.
// ---------------------------------------------------------------------------

import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { getMap } from "./mapBus";
import { query } from "./duckdb";
import { setDrawHooks, requestSync } from "./deckRender";
import { layers } from "./layers";

// UI-facing modes. `static` = drawing off (Terra Draw's built-in render-only
// mode); the rest map to Terra Draw mode names (`line` → `linestring`).
export type EditMode = "static" | "select" | "point" | "line" | "polygon";

const MODE_NAME: Record<EditMode, string> = {
  static: "static",
  select: "select",
  point: "point",
  line: "linestring",
  polygon: "polygon",
};

// Terra Draw stores ephemeral guidance geometry (selection points, midpoints,
// coordinate points) in the same store as the user's features; exclude anything
// carrying one of these property flags from the working set.
const GUIDANCE_KEYS = [
  "selectionPoint",
  "midPoint",
  "coordinatePoint",
  "closingPoint",
  "snappingPoint",
] as const;

const DRAW_MODES = new Set(["point", "linestring", "polygon"]);

function isWorkingFeature(f: GeoJSONStoreFeatures): boolean {
  const p = f.properties ?? {};
  if (GUIDANCE_KEYS.some((k) => p[k])) return false;
  return DRAW_MODES.has(String(p.mode));
}

type Listener = () => void;

let draw: TerraDraw | null = null;
let mode: EditMode = "static";
let featureCount = 0;
let scratchTick = 0; // monotonic — names committed tables main.scratch_<n>
let lastBottomId: string | undefined; // last deck z-order anchor we synced on
const selectedIds = new Set<string>();
let version = 0;
const listeners = new Set<Listener>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

// Recount the working set (drawn features only) and notify. Called on every
// Terra Draw change/finish so the toolbar's Commit affordance + count stay live.
function refresh(): void {
  featureCount = draw ? draw.getSnapshot().filter(isWorkingFeature).length : 0;
  // Nudge deck to re-apply z-order only when the Terra Draw layer anchor
  // actually appears/changes — not on every provisional edit (change fires per
  // pointer move while drawing), so we don't rebuild the deck layers each frame.
  const bottom = bottomLayerId();
  if (bottom !== lastBottomId) {
    lastBottomId = bottom;
    requestSync();
  }
  emit();
}

// The lowest Terra Draw layer id currently in the map style, so the deck overlay
// can render *beneath* the working set (draw-on-top). Terra Draw's layers all
// carry the `td-` prefix (adapter `prefixId`). Undefined when no draw layers
// exist yet → deck renders over the basemap exactly as before.
function bottomLayerId(): string | undefined {
  const map = getMap();
  if (!map || !draw) return undefined;
  const style = map.getStyle?.();
  const layer = style?.layers?.find((l) => l.id.startsWith("td-"));
  return layer?.id;
}

export const editing = {
  /** Scalar snapshot for `useSyncExternalStore`. */
  get version(): number {
    return version;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  get mode(): EditMode {
    return mode;
  },
  get featureCount(): number {
    return featureCount;
  },
  /** The deck-overlay gate: while any draw/edit mode is active, Terra Draw owns
   *  map clicks so deck must not pick/clear the selection. */
  isEditing(): boolean {
    return mode !== "static";
  },

  /**
   * Bring up Terra Draw on the shared map. Idempotent — safe to call from every
   * toolbar mount. No-op until the map exists; guards `start()` on the style so
   * the adapter can add its GL layers.
   */
  init(): void {
    if (draw) return;
    const map = getMap();
    if (!map) return;

    const adapter = new TerraDrawMapLibreGLAdapter({ map, prefixId: "td-" });
    // Per-geometry edit affordances for select mode: drag the whole feature,
    // drag a vertex, click a midpoint to insert a vertex, delete a vertex.
    const editFlags = {
      feature: {
        draggable: true,
        coordinates: { draggable: true, midpoints: true, deletable: true },
      },
    };
    draw = new TerraDraw({
      adapter,
      modes: [
        new TerraDrawPointMode(),
        new TerraDrawLineStringMode(),
        new TerraDrawPolygonMode(),
        new TerraDrawSelectMode({
          flags: { point: editFlags, linestring: editFlags, polygon: editFlags },
        }),
      ],
    });

    draw.on("change", refresh);
    draw.on("finish", refresh);
    draw.on("select", (id) => {
      selectedIds.add(String(id));
      emit();
    });
    draw.on("deselect", () => {
      selectedIds.clear();
      emit();
    });

    const start = () => draw?.start();
    if (map.isStyleLoaded()) start();
    else map.once("load", start);

    // Inject the edit gate + z-order provider into the read-only render path.
    setDrawHooks({ isEditing: this.isEditing, beforeId: bottomLayerId });
  },

  /** Switch digitizing mode (or `static` to turn drawing off). */
  setMode(m: EditMode): void {
    if (!draw) this.init();
    if (!draw || m === mode) return;
    mode = m;
    try {
      draw.setMode(MODE_NAME[m]);
    } catch {
      // setMode throws if called before start() (style not yet loaded); the mode
      // is recorded so a later start()/re-invoke reflects it. Swallow.
    }
    if (m !== "select") selectedIds.clear();
    emit();
  },

  /** Delete the feature(s) currently selected in select mode. */
  deleteSelected(): void {
    if (!draw || selectedIds.size === 0) return;
    draw.removeFeatures([...selectedIds]);
    selectedIds.clear();
    refresh();
  },

  /** Drop the entire working set (used after a successful commit). */
  clear(): void {
    draw?.clear();
    selectedIds.clear();
    refresh();
  },

  /** Number of features currently selected in select mode (drives the Delete button). */
  get selectedCount(): number {
    return selectedIds.size;
  },

  /**
   * Persist the working set into a native DuckDB table and re-render it through
   * the normal GeoArrow path. Returns the table name, or null when empty.
   *
   * A single `GEOMETRY` column holds mixed point/line/polygon; because the deck
   * render path probes one representative geometry type per layer, the committed
   * table is surfaced as one layer per geometry family present (split by
   * `ST_Dimension`) so nothing is silently dropped.
   */
  async commit(): Promise<string | null> {
    if (!draw) return null;
    const features = draw.getSnapshot().filter(isWorkingFeature);
    if (features.length === 0) return null;

    const n = await nextScratchIndex();
    scratchTick = n;
    const table = `main.scratch_${n}`;
    const rows = features
      .map((f, i) => `(${i + 1}, ST_GeomFromGeoJSON('${sqlLit(JSON.stringify(f.geometry))}'))`)
      .join(",\n  ");
    await query(
      `CREATE TABLE ${table} AS SELECT * FROM (VALUES\n  ${rows}\n) AS t(id, geom)`,
    );

    // One layer per geometry family present (point=0 / line=1 / polygon=2,
    // incl. Multi*), matching the deck render specs.
    const fams: Array<{ suffix: string; label: string; dim: number }> = [
      { suffix: "pt", label: "points", dim: 0 },
      { suffix: "ln", label: "lines", dim: 1 },
      { suffix: "poly", label: "polygons", dim: 2 },
    ];
    for (const f of fams) {
      const cnt = await query(
        `SELECT count(*) AS c FROM ${table} WHERE ST_Dimension(geom) = ${f.dim}`,
      );
      if (Number(cnt[0]?.c ?? 0) === 0) continue;
      await layers.addQuery({
        id: `scratch_${n}_${f.suffix}`,
        name: `Scratch ${n} (${f.label})`,
        sql: `SELECT geom FROM ${table} WHERE ST_Dimension(geom) = ${f.dim}`,
      });
    }

    this.clear();
    this.setMode("static");
    return table;
  },

  /** Tear Terra Draw down (map unmount). */
  destroy(): void {
    try {
      draw?.stop();
    } catch {
      // stop() throws if not started; ignore.
    }
    draw = null;
    mode = "static";
    featureCount = 0;
    lastBottomId = undefined;
    selectedIds.clear();
    emit();
  },
};

export type Editing = typeof editing;

// Next free `main.scratch_<n>` index. Scans existing tables so commits never
// clobber a scratch table left by an earlier session (the default DB may be
// file-backed) or an earlier commit this session.
async function nextScratchIndex(): Promise<number> {
  let max = scratchTick;
  try {
    const rows = await query(
      `SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main'`,
    );
    for (const r of rows) {
      const m = /^scratch_(\d+)$/.exec(String(r.table_name));
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch {
    // duckdb_tables() unavailable → fall back to the in-session counter.
  }
  return max + 1;
}

/** Escape a single-quoted SQL string literal. */
function sqlLit(v: string): string {
  return v.replace(/'/g, "''");
}
