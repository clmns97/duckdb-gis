// ---------------------------------------------------------------------------
// Shared MapLibre vector-tile styling (T-058).
//
// Both the ST_AsMVT tiler (`tiles.ts`) and the Overture PMTiles renderer
// (`overtureTiles.ts`) draw a vector source-layer that may mix geometry
// families in one tile, so each needs one style layer per family (fill / line /
// circle) filtered on `$type`. This module owns that pattern + the default
// paint so the two renderers share one definition instead of copying it.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";

export const DEFAULT_FILL = {
  "fill-color": "#6366f1",
  "fill-opacity": 0.35,
  "fill-outline-color": "#494ab9",
};
export const DEFAULT_LINE = { "line-color": "#494ab9", "line-width": 2 };
export const DEFAULT_CIRCLE = {
  "circle-color": "#6366f1",
  "circle-radius": 4,
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 1.2,
};

/** Per-family paint overrides, merged over the defaults. */
export interface VectorFamilyPaint {
  fill?: Record<string, unknown>;
  line?: Record<string, unknown>;
  circle?: Record<string, unknown>;
}

export interface FamilyLayerOptions {
  /** Map source id already added to the style. */
  source: string;
  /** Vector-tile source-layer name to read from. */
  sourceLayer: string;
  /** Layer ids are `${idBase}-fill|-line|-circle`. Must be word-char-safe. */
  idBase: string;
  paint?: VectorFamilyPaint;
  /** Insert before this layer id (z-order); appended on top when omitted. */
  beforeId?: string;
}

const FAMILIES = [
  { suffix: "fill", type: "fill", geom: "Polygon", def: DEFAULT_FILL },
  { suffix: "line", type: "line", geom: "LineString", def: DEFAULT_LINE },
  { suffix: "circle", type: "circle", geom: "Point", def: DEFAULT_CIRCLE },
] as const;

/**
 * Add fill/line/circle style layers for one vector source-layer, each filtered
 * on `$type` so a mixed-geometry tile draws every family. Idempotent per id.
 * Returns the ids of the layers now present (added or pre-existing).
 */
export function addFamilyLayers(map: maplibregl.Map, opts: FamilyLayerOptions): string[] {
  const ids: string[] = [];
  for (const fam of FAMILIES) {
    const id = `${opts.idBase}-${fam.suffix}`;
    ids.push(id);
    if (map.getLayer(id)) continue;
    map.addLayer(
      {
        id,
        type: fam.type,
        source: opts.source,
        "source-layer": opts.sourceLayer,
        filter: ["==", "$type", fam.geom],
        paint: { ...fam.def, ...opts.paint?.[fam.suffix] },
      } as Parameters<maplibregl.Map["addLayer"]>[0],
      opts.beforeId,
    );
  }
  return ids;
}

/** Remove the fill/line/circle style layers for an id base. */
export function removeFamilyLayers(map: maplibregl.Map, idBase: string): void {
  for (const fam of FAMILIES) {
    const id = `${idBase}-${fam.suffix}`;
    if (map.getLayer(id)) map.removeLayer(id);
  }
}
