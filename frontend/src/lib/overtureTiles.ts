// ---------------------------------------------------------------------------
// Overture PMTiles renderer + selection (T-058).
//
// Overture publishes pre-tiled, per-zoom-simplified data for all six themes as
// single hosted PMTiles archives, fetched by HTTP range request. Rendering them
// as native MapLibre vector-tile layers sidesteps the client-side polygon
// triangulation that froze the tab on raw Overture buildings (T-029): a low-zoom
// tile carries a tiny fraction of the vertices, and MapLibre fills polygons on
// the GPU without earcut.
//
// One code path for all six themes: each archive names its own vector_layers in
// its metadata (buildings → building/building_part, base → land/water/…, etc.),
// and each is drawn with one style layer per geometry family (FAMILIES below).
// The layer is display + selection only — never edited. Selecting features
// (`lib/selectTool.ts`) feeds "Create Layer from Selection" (see overture.ts), which
// materialises the real geometry from GeoParquet.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import { Protocol, PMTiles } from "pmtiles";
import { getMap, whenStyleReady } from "./mapBus";
import { selection, type Pick } from "./selection";
import type { OvertureTheme } from "./overture";
import { bboxOf } from "./bbox";

export const OVERTURE_TILES_BASE =
  "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles";

/** URL of a theme's hosted PMTiles archive for a release. */
export function tileArchiveUrl(themeId: string, release: string): string {
  return `${OVERTURE_TILES_BASE}/${release}/${themeId}.pmtiles`;
}

// A vector source-layer may mix geometry families in one tile, so it gets one
// style layer per family (fill / line / circle), filtered on `$type`.
// Selected features (feature-state `selected`) draw amber, as in deck layers.
const sel = (on: string, off: string) => [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  on,
  off,
];
const FAMILIES = [
  {
    type: "fill",
    geom: "Polygon",
    paint: {
      "fill-color": sel("#ff9f1c", "#6366f1"),
      "fill-opacity": 0.35,
      "fill-outline-color": sel("#d97706", "#494ab9"),
    },
  },
  {
    type: "line",
    geom: "LineString",
    paint: { "line-color": sel("#d97706", "#494ab9"), "line-width": 2 },
  },
  {
    type: "circle",
    geom: "Point",
    paint: {
      "circle-color": sel("#ff9f1c", "#6366f1"),
      "circle-radius": 4,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.2,
    },
  },
] as const;

interface TileLayerEntry {
  /** The PMTiles archive URL — the key `protocol.tiles` caches it under. */
  url: string;
  sourceId: string;
  /** All fill/line/circle style-layer ids across every source-layer. */
  styleLayerIds: string[];
  visible: boolean;
}

const registry = new Map<string, TileLayerEntry>();
// styleLayerId -> owning app layer id, for resolving queryRenderedFeatures hits.
const styleLayerToLayer = new Map<string, string>();

let protocol: Protocol | null = null;
function ensureProtocol(): Protocol {
  if (protocol) return protocol;
  protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  return protocol;
}

function sourceIdFor(layerId: string): string {
  return `ovt:${layerId}`;
}

interface VectorLayerMeta {
  id: string;
}

/**
 * Add a theme's hosted PMTiles as a native MapLibre vector-tile layer. Reads the
 * archive's `vector_layers` metadata and draws each with the family split.
 * The layer's bounds are deliberately not surfaced here: a PMTiles archive
 * covers the whole planet, so there is nothing meaningful to frame the camera
 * on (the store leaves "Zoom to layer" disabled for this layer kind instead).
 */
export async function addOvertureTileLayer(
  layerId: string,
  theme: OvertureTheme,
  release: string,
): Promise<void> {
  const proto = ensureProtocol();
  const url = tileArchiveUrl(theme.id, release);
  const pm = new PMTiles(url);
  proto.add(pm);

  const metadata = await pm.getMetadata();
  const vectorLayers = ((metadata as { vector_layers?: VectorLayerMeta[] })?.vector_layers ??
    []) as VectorLayerMeta[];

  const sourceId = sourceIdFor(layerId);
  const styleLayerIds: string[] = [];

  const apply = (map: maplibregl.Map) => {
    if (!map.getSource(sourceId)) {
      // `promoteId`: key features by their GERS id, for feature-state highlight.
      map.addSource(sourceId, { type: "vector", url: `pmtiles://${url}`, promoteId: "id" });
    }
    for (const vl of vectorLayers) {
      for (const fam of FAMILIES) {
        const id = `${layerId}__${vl.id}-${fam.type}`;
        styleLayerIds.push(id);
        styleLayerToLayer.set(id, layerId);
        if (map.getLayer(id)) continue;
        map.addLayer({
          id,
          type: fam.type,
          source: sourceId,
          "source-layer": vl.id,
          filter: ["==", "$type", fam.geom],
          paint: fam.paint,
        } as Parameters<maplibregl.Map["addLayer"]>[0]);
      }
    }
    registry.set(layerId, { url, sourceId, styleLayerIds, visible: true });
  };

  const map = getMap();
  if (map) await whenStyleReady(map, () => apply(map));
}

export function removeOvertureTileLayer(layerId: string): void {
  const entry = registry.get(layerId);
  const map = getMap();
  if (entry && map) {
    for (const id of entry.styleLayerIds) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId);
  }
  entry?.styleLayerIds.forEach((id) => styleLayerToLayer.delete(id));
  // Drop the archive's decoded directory/header cache too — otherwise it
  // outlives the layer for the rest of the app's lifetime.
  if (entry) protocol?.tiles.delete(entry.url);
  registry.delete(layerId);
  highlighted.delete(layerId);
  selection.clear(layerId);
}

export function setOvertureTileVisible(layerId: string, visible: boolean): void {
  const entry = registry.get(layerId);
  const map = getMap();
  if (!entry || !map) return;
  entry.visible = visible;
  for (const id of entry.styleLayerIds) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

// --- Selection -------------------------------------------------------------

/** Features of one PMTiles layer inside a canvas-pixel rect, de-duped on GERS
 *  id, topmost first. The select gestures live in `lib/selectTool.ts`. */
export function pickTileRect(
  layerId: string,
  p0: maplibregl.PointLike,
  p1: maplibregl.PointLike,
): Pick[] {
  const entry = registry.get(layerId);
  const map = getMap();
  if (!entry?.visible || !map) return [];
  const picks = new Map<string, Pick>();
  for (const f of map.queryRenderedFeatures([p0, p1], { layers: entry.styleLayerIds })) {
    const id = f.properties?.id;
    if (id == null || picks.has(String(id))) continue;
    const coords = "coordinates" in f.geometry ? f.geometry.coordinates : [];
    picks.set(String(id), { key: String(id), bbox: bboxOf(coords), sourceLayer: f.sourceLayer });
  }
  return [...picks.values()];
}

// Selected features draw amber through MapLibre feature-state (the paint
// expressions in FAMILIES); mirror the selection store into it on each change.
const highlighted = new Map<string, Pick[]>(); // layerId -> picks flagged now
function syncHighlight(): void {
  const map = getMap();
  if (!map) return;
  for (const [layerId, entry] of registry) {
    const want = selection.picks(layerId);
    const keep = new Set(want.map((p) => p.key));
    for (const p of highlighted.get(layerId) ?? []) {
      if (!keep.has(p.key)) {
        map.setFeatureState({ source: entry.sourceId, sourceLayer: p.sourceLayer, id: p.key }, { selected: false });
      }
    }
    for (const p of want) {
      map.setFeatureState({ source: entry.sourceId, sourceLayer: p.sourceLayer, id: p.key }, { selected: true });
    }
    highlighted.set(layerId, want);
  }
}
selection.subscribe(syncHighlight);
