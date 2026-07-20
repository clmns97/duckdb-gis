// ---------------------------------------------------------------------------
// Editing / digitizing store (T-025, reworked in T-038).
//
// Two representations, two jobs:
//   • The read-only render path (`deckRender.ts`, GeoArrow → deck.gl, immutable
//     columnar buffers) shows layers and drives *feature selection for
//     processing* (T-041). It can't do vertex editing.
//   • This store owns *feature editing*: an editable working set on a
//     MapLibre-native GeoJSON source driven by Terra Draw (draw point/line/
//     polygon, drag/insert/delete vertices, delete features).
//
// Editing is an explicit **mode** bound to a single **edit target**, entered two
// ways (T-038):
//   • "New layer" — `beginNewLayer({name, geometryKind})` creates an empty layer
//     and drops you into drawing it. Commit writes a new `main.<name>` table and
//     registers it as a catalog layer.
//   • "Toggle editing" on an existing catalog layer — `beginEdit(layer)` loads
//     that layer's features (via `ST_AsGeoJSON`, keyed by DuckDB `rowid`) into
//     the working set. Commit writes the edits back to that same table
//     (UPDATE/INSERT/DELETE by `rowid`), then re-renders it.
//
// One geometry family per layer: a target carries a `geometryKind`, and the
// toolbar offers only that draw mode (+ Select for vertex editing). The
// digitizing toolbar renders only while a target is active (`isEditing()`), so
// the map is clean otherwise.
//
// Store shape mirrors `selection.ts` / `layers.ts`: a module-level singleton
// with a `version` scalar + `subscribe`, read from React via
// `useSyncExternalStore`. It imports `deckRender` (edit gate + z-order hook +
// hide-while-editing) and `layers` (register/refresh on commit); `deckRender`
// does NOT import this module — the coupling is one-directional via `setDrawHooks`.
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
import { query, str, sqlLit } from "./duckdb";
import { setDrawHooks, requestSync, setDeckLayerSuppressed } from "./deckRender";
import {
  layers,
  ident,
  qualified,
  type ActiveLayer,
  type GeometryKind,
  type LayerSource,
} from "./layers";
import { selection } from "./selection";

// UI-facing modes. `static` = drawing off (Terra Draw's built-in render-only
// mode); the rest map to Terra Draw mode names (`line` → `linestring`).
export type EditMode = "static" | "select" | "point" | "line" | "polygon";
export type DrawMode = "point" | "line" | "polygon";

const MODE_NAME: Record<EditMode, string> = {
  static: "static",
  select: "select",
  point: "point",
  line: "linestring",
  polygon: "polygon",
};

// A layer holds one geometry family. `GeometryKind` and `DrawMode` are the same
// three-member union, so the family *is* the draw mode; the Terra Draw mode name
// used when loading its features comes from the shared `MODE_NAME`.

// Edit-in-place pulls a layer's features into GeoJSON on the main thread; cap the
// row count so we never drag a whole heavy layer into memory. Selecting a subset
// to edit is a deliberate follow-up (T-038 context).
const EDIT_CAP = 2000;

// The active edit target: either a not-yet-created new layer, or an existing
// catalog layer being edited in place.
type EditTarget =
  | { kind: "new"; name: string; geometryKind: GeometryKind }
  | {
      kind: "existing";
      layerId: string;
      name: string;
      geometryKind: GeometryKind;
      source: LayerSource;
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
let target: EditTarget | null = null;
let featureCount = 0;
let lastBottomId: string | undefined; // last deck z-order anchor we synced on
const selectedIds = new Set<string>();
// DuckDB rowids loaded into the working set for an existing-layer edit, so commit
// can tell edited rows (UPDATE) from new draws (INSERT) and detect deletions.
const loadedRids = new Set<string>();
// Terra Draw feature ids the user actually changed since edit began (T-042), so
// commit only UPDATEs touched rows instead of rewriting all loaded features.
const dirty = new Set<string>();
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
  /** The active edit target (null when not editing). */
  get target(): EditTarget | null {
    return target;
  },
  /** The single draw mode allowed for the active target's geometry family. */
  get allowedDrawMode(): DrawMode | null {
    return target ? target.geometryKind : null;
  },
  /** True while an edit target is active — the digitizing toolbar's visibility
   *  gate, and the deck-overlay gate (Terra Draw owns map clicks while editing,
   *  so deck must not pick/clear the processing selection). */
  isEditing(): boolean {
    return target !== null;
  },

  /**
   * Bring up Terra Draw on the shared map. Idempotent — safe to call from every
   * `begin*`. No-op until the map exists; guards `start()` on the style so the
   * adapter can add its GL layers.
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

    // Terra Draw's `change` fires with the ids that changed (drawn, dragged,
    // vertex-edited); record them so an existing-layer commit only writes rows
    // the user actually touched (T-042). Guidance-geometry ids get marked too but
    // never match a loaded feature, so they're harmless.
    draw.on("change", (ids) => {
      for (const id of ids ?? []) dirty.add(String(id));
      refresh();
    });
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

  /**
   * Enter edit mode on a brand-new, empty layer of one geometry family and start
   * drawing it. The layer's table is created on Commit (`main.<name>`).
   */
  beginNewLayer(opts: { name: string; geometryKind: GeometryKind }): void {
    this.init();
    if (!draw) return;
    selection.clear(); // processing selection is meaningless while digitizing
    draw.clear();
    loadedRids.clear();
    dirty.clear();
    selectedIds.clear();
    target = { kind: "new", name: opts.name, geometryKind: opts.geometryKind };
    this.setMode(opts.geometryKind); // drop straight into drawing
    refresh(); // recount even if setMode short-circuited (mode already matched)
  },

  /**
   * Enter edit mode on an existing catalog-table layer, loading its features into
   * the editable working set (keyed by DuckDB `rowid` so Commit can write back to
   * the exact rows). Guarded by a row-count cap. Rejects with a readable Error
   * for non-editable layers (query-backed, still loading) or oversized ones.
   */
  async beginEdit(layer: ActiveLayer): Promise<void> {
    if (!layer.source) {
      throw new Error("Only catalog-table layers can be edited in place.");
    }
    if (layer.status !== "ready" || !layer.geometryKind) {
      throw new Error("Layer is still loading — try again in a moment.");
    }
    this.init();
    if (!draw) throw new Error("The map is not ready yet.");

    const kind = layer.geometryKind;
    const q = qualified(layer.source);
    const gcol = ident(layer.source.geomColumn);
    const cnt = await query(`SELECT count(*) AS n FROM ${q} WHERE ${gcol} IS NOT NULL`);
    const n = Number(cnt[0]?.n ?? 0);
    if (n > EDIT_CAP) {
      throw new Error(
        `Layer has ${n} features; edit-in-place is limited to ${EDIT_CAP}. ` +
          `Editing a selected subset is a follow-up.`,
      );
    }
    const rows = await query(
      `SELECT rowid AS rid, ST_AsGeoJSON(${gcol}) AS gj FROM ${q} WHERE ${gcol} IS NOT NULL`,
    );

    selection.clear();
    draw.clear();
    loadedRids.clear();
    selectedIds.clear();

    const tmode = MODE_NAME[kind];
    const feats = rows.map((r) => {
      loadedRids.add(String(r.rid));
      return {
        id: uuid(),
        type: "Feature",
        geometry: JSON.parse(str(r.gj)),
        properties: { mode: tmode, __rid: String(r.rid) },
      } as unknown as GeoJSONStoreFeatures;
    });
    if (feats.length) draw.addFeatures(feats);
    // Loading features fires `change`; reset dirty so the freshly loaded set
    // counts as untouched until the user actually edits (T-042).
    dirty.clear();

    target = {
      kind: "existing",
      layerId: layer.id,
      name: layer.name,
      geometryKind: kind,
      source: layer.source,
    };
    // Suppress the read-only deck copy so we don't double-draw over the editable
    // set — separate from the user's Eye toggle, so their show/hide is preserved
    // across the edit (T-043).
    setDeckLayerSuppressed(layer.id, true);
    this.setMode("select"); // land in vertex-edit mode, ready to click a feature
    refresh();
  },

  /** Switch digitizing mode. Constrained to Select + the target's own draw mode
   *  so a layer never gets mixed geometry (T-038). */
  setMode(m: EditMode): void {
    if (!draw) this.init();
    if (!draw) return;
    if (target && m !== "select" && m !== "static" && m !== target.geometryKind) {
      return; // reject a draw mode that isn't this layer's family
    }
    if (m === mode) return;
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

  /** Number of features currently selected in select mode (drives the Delete button). */
  get selectedCount(): number {
    return selectedIds.size;
  },

  /**
   * Leave edit mode, discarding the working set. Cancels an in-progress edit
   * without committing; also the post-commit teardown. Restores the read-only
   * deck copy of an edited existing layer.
   */
  finishEdit(): void {
    const t = target;
    target = null;
    mode = "static";
    selectedIds.clear();
    loadedRids.clear();
    dirty.clear();
    draw?.clear();
    if (t?.kind === "existing" && layers.get(t.layerId)) {
      setDeckLayerSuppressed(t.layerId, false);
    }
    featureCount = 0;
    emit();
  },

  /**
   * Persist the working set. Diverges by target:
   *   • new     → CREATE TABLE `main.<name>` (single geometry column) and
   *               register it as a catalog layer (so it's re-editable/styleable).
   *   • existing→ UPDATE/INSERT/DELETE against the source table keyed by `rowid`,
   *               in one transaction, then re-render the layer.
   * Returns the affected table (qualified), or null when there is nothing to
   * commit. Leaves edit mode on success.
   */
  async commit(): Promise<string | null> {
    if (!draw || !target) return null;
    const features = draw.getSnapshot().filter(isWorkingFeature);

    if (target.kind === "new") {
      if (features.length === 0) return null;
      const name = target.name;
      const table = `main.${ident(name)}`;
      const rows = features
        .map((f, i) => `(${i + 1}, ST_GeomFromGeoJSON('${sqlLit(JSON.stringify(f.geometry))}'))`)
        .join(",\n  ");
      await query(
        `CREATE TABLE ${table} AS SELECT * FROM (VALUES\n  ${rows}\n) AS t(id, geom)`,
      );
      const dbRows = await query(`SELECT current_database() AS db`);
      const db = str(dbRows[0]?.db ?? "memory");
      this.finishEdit();
      await layers.add({ db, schema: "main", table: name, geomColumn: "geom" });
      return table;
    }

    // Existing layer: write the diff back to its table by rowid. Partition the
    // working set once, then issue a constant number of batched statements
    // (INSERT/UPDATE/DELETE) rather than one round-trip per feature (T-042).
    const t = target;
    const q = qualified(t.source);
    const gcol = ident(t.source.geomColumn);
    const geomExpr = (f: (typeof features)[number]) =>
      `ST_GeomFromGeoJSON('${sqlLit(JSON.stringify(f.geometry))}')`;

    const inserts: string[] = []; // new draws → INSERT
    const updates: string[] = []; // touched loaded rows → batched UPDATE
    const seen = new Set<string>();
    for (const f of features) {
      const rid = f.properties?.__rid != null ? String(f.properties.__rid) : null;
      if (rid && loadedRids.has(rid)) {
        seen.add(rid);
        // Only rewrite rows the user actually edited; untouched loaded features
        // are left alone.
        if (dirty.has(String(f.id))) updates.push(`(${rid}, ${geomExpr(f)})`);
      } else {
        inserts.push(`(${geomExpr(f)})`);
      }
    }
    const deletes = [...loadedRids].filter((rid) => !seen.has(rid));

    await query("BEGIN TRANSACTION");
    try {
      if (inserts.length) {
        await query(`INSERT INTO ${q} (${gcol}) VALUES ${inserts.join(", ")}`);
      }
      if (updates.length) {
        await query(
          `UPDATE ${q} AS tbl SET ${gcol} = v.g ` +
            `FROM (VALUES ${updates.join(", ")}) AS v(rid, g) WHERE tbl.rowid = v.rid`,
        );
      }
      if (deletes.length) {
        await query(`DELETE FROM ${q} WHERE rowid IN (${deletes.join(", ")})`);
      }
      await query("COMMIT");
    } catch (e) {
      try {
        await query("ROLLBACK");
      } catch {
        // best-effort rollback
      }
      throw e;
    }

    const layerId = t.layerId;
    this.finishEdit();
    await layers.refresh(layerId); // re-render the edited layer from its table
    return q;
  },

  /** Tear Terra Draw down (map unmount). */
  destroy(): void {
    // Restore a mid-edit layer's deck copy so an unmount during an existing-layer
    // edit never leaves it permanently suppressed (T-043).
    if (target?.kind === "existing") setDeckLayerSuppressed(target.layerId, false);
    try {
      draw?.stop();
    } catch {
      // stop() throws if not started; ignore.
    }
    draw = null;
    mode = "static";
    target = null;
    featureCount = 0;
    lastBottomId = undefined;
    selectedIds.clear();
    loadedRids.clear();
    dirty.clear();
    emit();
  },
};

export type Editing = typeof editing;

// A v4 UUID for Terra Draw feature ids. `crypto.randomUUID` only exists in a
// secure context (HTTPS / localhost); the Tailscale preview is plain HTTP, so
// fall back to `getRandomValues` (available on HTTP), then Math.random.
function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
