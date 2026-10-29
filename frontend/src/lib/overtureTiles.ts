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
// The layer is display + selection only — never edited. Clicking / box-selecting
// features feeds "Create Layer from Selection" (see overture.ts), which
// materialises the real geometry from GeoParquet.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import { changeSignal } from "./store";
import { Protocol, PMTiles } from "pmtiles";
import { getMap, whenStyleReady } from "./mapBus";
import { pmSelection, type PmPick } from "./pmtilesSelection";
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
const FAMILIES = [
  {
    type: "fill",
    geom: "Polygon",
    paint: { "fill-color": "#6366f1", "fill-opacity": 0.35, "fill-outline-color": "#494ab9" },
  },
  { type: "line", geom: "LineString", paint: { "line-color": "#494ab9", "line-width": 2 } },
  {
    type: "circle",
    geom: "Point",
    paint: {
      "circle-color": "#6366f1",
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
    installSelectionHandlers(map);
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "vector", url: `pmtiles://${url}` });
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
  pmSelection.clear(layerId);
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

/** Style-layer ids across all *visible* PMTiles layers (for queryRenderedFeatures). */
function visibleStyleLayerIds(): string[] {
  const ids: string[] = [];
  for (const entry of registry.values()) {
    if (entry.visible) ids.push(...entry.styleLayerIds);
  }
  return ids;
}

// --- Selection -------------------------------------------------------------

// Group rendered-feature hits by owning app layer, de-duped on GERS id.
function picksByLayer(features: maplibregl.MapGeoJSONFeature[]): Map<string, PmPick[]> {
  const byLayer = new Map<string, Map<string, PmPick>>();
  for (const f of features) {
    const layerId = styleLayerToLayer.get(f.layer.id);
    const id = f.properties?.id;
    if (!layerId || id == null) continue;
    const key = String(id);
    let picks = byLayer.get(layerId);
    if (!picks) byLayer.set(layerId, (picks = new Map()));
    if (!picks.has(key)) picks.set(key, { id: key, bbox: bboxOf("coordinates" in f.geometry ? f.geometry.coordinates : []) });
  }
  const out = new Map<string, PmPick[]>();
  for (const [layerId, picks] of byLayer) out.set(layerId, [...picks.values()]);
  return out;
}

// Box-select mode: while on, a drag paints a rectangle and selects everything
// under it (QGIS "Select Features by Area"). Off, the map pans normally.
let selectMode = false;
const modeChanges = changeSignal();
export const boxSelect = {
  get active(): boolean {
    return selectMode;
  },
  toggle(): void {
    selectMode = !selectMode;
    modeChanges.emit();
  },
  set(on: boolean): void {
    if (on === selectMode) return;
    selectMode = on;
    modeChanges.emit();
  },
  subscribe: modeChanges.subscribe,
};

function applyPicks(layerHits: Map<string, PmPick[]>, additive: boolean): void {
  if (layerHits.size === 0) {
    if (!additive) pmSelection.clear();
    return;
  }
  // Topmost/first hit layer wins scope (selection is single-layer, T-058).
  const [layerId, picks] = [...layerHits][0];
  pmSelection.select(layerId, picks, additive);
}

let handlersInstalled = false;
function installSelectionHandlers(map: maplibregl.Map): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  // Click-select: hit-test the point against visible PMTiles layers.
  map.on("click", (e) => {
    if (selectMode) return; // drag handler owns interactions in box-select mode
    const layers = visibleStyleLayerIds();
    if (layers.length === 0) return;
    const feats = map.queryRenderedFeatures(e.point, { layers });
    applyPicks(picksByLayer(feats), e.originalEvent.shiftKey);
  });

  installBoxDrag(map);
}

function installBoxDrag(map: maplibregl.Map): void {
  const container = map.getContainer();
  let start: maplibregl.Point | null = null;
  let box: HTMLDivElement | null = null;
  let additive = false;

  const onMouseDown = (e: MouseEvent) => {
    if (!selectMode || e.button !== 0) return;
    e.preventDefault();
    additive = e.shiftKey;
    map.dragPan.disable();
    start = new maplibregl.Point(e.clientX, e.clientY);
    box = document.createElement("div");
    box.style.cssText =
      "position:fixed;z-index:50;pointer-events:none;border:1px solid #6366f1;background:rgba(99,102,241,0.2);";
    document.body.appendChild(box);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!start || !box) return;
    const x = Math.min(e.clientX, start.x);
    const y = Math.min(e.clientY, start.y);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${Math.abs(e.clientX - start.x)}px`;
    box.style.height = `${Math.abs(e.clientY - start.y)}px`;
  };

  const onMouseUp = (e: MouseEvent) => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    map.dragPan.enable();
    box?.remove();
    const from = start;
    start = null;
    box = null;
    if (!from) return;
    const rect = container.getBoundingClientRect();
    const p0 = new maplibregl.Point(from.x - rect.left, from.y - rect.top);
    const p1 = new maplibregl.Point(e.clientX - rect.left, e.clientY - rect.top);
    const layers = visibleStyleLayerIds();
    if (layers.length === 0) return;
    // A zero-area drag (a click in box mode) still hit-tests at the point.
    const feats = map.queryRenderedFeatures([p0, p1], { layers });
    applyPicks(picksByLayer(feats), additive);
  };

  container.addEventListener("mousedown", onMouseDown);
}
