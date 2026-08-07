// ---------------------------------------------------------------------------
// PMTiles feature selection (T-058).
//
// Overture PMTiles layers are display+selection only: the user clicks or
// box-selects features to feed "Create Layer from Selection", which materialises
// them from the GeoParquet source. Tile features carry Overture's GERS `id`
// (a string), so this selection keys on that — deliberately separate from
// `selection.ts`, whose numeric `__fid`/`sourceSql` model fits deck.gl layers,
// not string-keyed vector tiles. Selection is scoped to one PMTiles layer at a
// time (its `layerId`); picking on a different layer switches scope.
// ---------------------------------------------------------------------------

import type { Bbox } from "./overture";

type Listener = () => void;

// id -> the feature's tile-geometry bbox (used to prune the materialise query's
// row-groups and to size the "large selection" warning; never for geometry).
const selected = new Map<string, Bbox>();
let layerId: string | null = null;
let version = 0;
const listeners = new Set<Listener>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Union bbox of every selected feature, or null when nothing is selected. */
export function selectionBounds(): Bbox | null {
  if (selected.size === 0) return null;
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;
  for (const b of selected.values()) {
    xmin = Math.min(xmin, b.xmin);
    ymin = Math.min(ymin, b.ymin);
    xmax = Math.max(xmax, b.xmax);
    ymax = Math.max(ymax, b.ymax);
  }
  return { xmin, ymin, xmax, ymax };
}

export interface PmPick {
  id: string;
  bbox: Bbox;
}

export const pmSelection = {
  /** Bump on every mutation; drives useSyncExternalStore / updateTriggers. */
  get version(): number {
    return version;
  },
  /** The PMTiles layer the current selection belongs to, or null. */
  get layerId(): string | null {
    return layerId;
  },
  get size(): number {
    return selected.size;
  },
  ids: (): string[] => [...selected.keys()],
  bounds: selectionBounds,

  /**
   * Replace (or, when additive, extend) the selection with picks on `id`. A pick
   * on a different layer switches scope and clears the previous layer's set, so
   * ids from two layers never mix. Additive toggles each pick within the scope.
   */
  select(pickLayerId: string, picks: PmPick[], additive: boolean): void {
    if (pickLayerId !== layerId || !additive) {
      selected.clear();
      layerId = pickLayerId;
    }
    for (const p of picks) {
      if (additive && selected.has(p.id)) selected.delete(p.id);
      else selected.set(p.id, p.bbox);
    }
    emit();
  },

  /** Clear the selection (e.g. clicking empty map, or the layer was removed). */
  clear(scopeLayerId?: string): void {
    if (scopeLayerId != null && scopeLayerId !== layerId) return;
    if (selected.size === 0 && layerId === null) return;
    selected.clear();
    layerId = null;
    emit();
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
