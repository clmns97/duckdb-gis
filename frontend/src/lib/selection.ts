// ---------------------------------------------------------------------------
// Feature selection (T-003, #110).
//
// One store for every layer kind, kept **per layer** as QGIS does: each layer
// has its own set of selected features, and the select gestures only ever act
// on the active layer (`lib/selectTool.ts`, `deckRender`'s click handler).
//
// A selected feature is identified by a key that resolves back to its source:
//
//   • deck layers (catalog tables, query layers, the SQL Run preview): the
//     per-render `__fid` from `fidTaggedRelation`. The render path runs
//     arbitrary user SQL — a `UNION ALL`, a join, … — so a table + primary key
//     isn't generally available; a deterministic `row_number()` over the
//     layer's source query is. A tool rebuilds the rows with
//       SELECT * FROM (<fidTaggedRelation(sourceSql)>) WHERE __fid IN (<fids>)
//     `row_number() OVER ()` is positional, so a layer's selection is dropped
//     whenever its data is re-rendered (`deckRender` calls `drop`).
//   • Overture PMTiles layers: the feature's GERS `id` (a string), with its tile
//     bbox (prunes "Create Layer from Selection"'s row groups) and source-layer
//     (needed to highlight it through MapLibre feature-state).
// ---------------------------------------------------------------------------

import { bboxOf, type Bbox } from "./bbox";
import { changeSignal } from "./store";

/** Column name carrying the per-render stable feature id. */
export const FID = "__fid";

/**
 * Wrap a source query so every surviving feature carries a deterministic
 * `__fid`. Mirrors the filtering `deckRender` applies before rendering
 * (`geom IS NOT NULL`) so fids assigned here match the ones the map renders.
 */
export function fidTaggedRelation(sourceSql: string): string {
  return `SELECT *, row_number() OVER () AS ${FID} FROM (${cleanSql(sourceSql)}) _q WHERE geom IS NOT NULL`;
}

/** A query as a subquery-safe relation: trimmed, trailing `;` dropped. */
export function cleanSql(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

export type FeatureKey = number | string;

/** A hit-tested feature: its key plus what PMTiles features carry along. */
export interface Pick {
  key: FeatureKey;
  bbox?: Bbox;
  sourceLayer?: string;
}

/** How a set of picks combines with the layer's current selection (QGIS's
 *  "create new / add to / remove from / select within" modes; `toggle` is a
 *  tap in select mode). */
export type SelectMode = "replace" | "add" | "remove" | "intersect" | "toggle";

const byLayer = new Map<string, Map<FeatureKey, Pick>>();
const signal = changeSignal();

const setOf = (layerId: string) => byLayer.get(layerId);

export const selection = {
  /** Bump on every mutation; use as a deck.gl `updateTriggers` value. */
  get version(): number {
    return signal.version;
  },
  subscribe: signal.subscribe,

  has: (layerId: string, key: FeatureKey): boolean => setOf(layerId)?.has(key) ?? false,
  /** Number of selected features in one layer. */
  size: (layerId: string | null | undefined): number =>
    layerId ? (setOf(layerId)?.size ?? 0) : 0,
  keys: (layerId: string): FeatureKey[] => [...(setOf(layerId)?.keys() ?? [])],
  picks: (layerId: string): Pick[] => [...(setOf(layerId)?.values() ?? [])],
  /** Union bbox of a layer's selected PMTiles features, or null. */
  bounds(layerId: string): Bbox | null {
    const boxes = selection.picks(layerId).flatMap((p) => (p.bbox ? [p.bbox] : []));
    if (boxes.length === 0) return null;
    return bboxOf(boxes.map((b) => [[b.xmin, b.ymin], [b.xmax, b.ymax]]));
  },
  /** Layers that currently have a selection. */
  layerIds: (): string[] => [...byLayer.keys()],

  /** Apply picks to a layer's selection. */
  select(layerId: string, picks: Pick[], mode: SelectMode): void {
    const cur = setOf(layerId) ?? new Map<FeatureKey, Pick>();
    let next: Map<FeatureKey, Pick>;
    if (mode === "replace") {
      next = new Map(picks.map((p) => [p.key, p]));
    } else if (mode === "intersect") {
      next = new Map(picks.filter((p) => cur.has(p.key)).map((p) => [p.key, p]));
    } else {
      next = cur;
      for (const p of picks) {
        if (mode === "remove" || (mode === "toggle" && next.has(p.key))) next.delete(p.key);
        else next.set(p.key, p);
      }
    }
    if (next.size) byLayer.set(layerId, next);
    else byLayer.delete(layerId);
    signal.emit();
  },

  /** Clear one layer's selection, or every layer's when no id is given. */
  clear(layerId?: string): void {
    if (layerId === undefined ? byLayer.size === 0 : !byLayer.has(layerId)) return;
    if (layerId === undefined) byLayer.clear();
    else byLayer.delete(layerId);
    signal.emit();
  },
};
