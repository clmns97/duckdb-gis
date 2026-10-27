// ---------------------------------------------------------------------------
// Basemaps (T-033).
//
// A switchable basemap sits *underneath* all data layers. The catalog is plain
// data so adding a provider is one entry. Switching never calls
// `map.setStyle()` — that wipes every source/layer (our deck.gl overlay and
// ST_AsMVT sources included). Instead the basemap's sources and layers are
// inserted at the very bottom of the style, and swapped by removing/re-adding
// just that group (`applyBasemap`), leaving data layers alone. A basemap is
// either XYZ raster tiles (one source + layer) or a MapLibre style URL, whose
// sources/layers are copied in under an id prefix.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { MenuItem } from "../components/ContextMenu";
import { getMap, whenStyleReady } from "./mapBus";

export type BasemapProvider = "OpenFreeMap" | "OSM" | "ESRI" | "None";

export interface Basemap {
  id: string;
  label: string;
  provider: BasemapProvider;
  /** XYZ raster tile URL templates (a raster basemap). */
  tiles?: string[];
  /** MapLibre style JSON URL (a vector basemap). */
  styleUrl?: string;
  /** Neither `tiles` nor `styleUrl`: "no basemap". */
  attribution: string;
  tileSize?: number;
}

const OSM_ATTR = "© OpenStreetMap contributors";
// OpenFreeMap: free, no API key or registration (https://openfreemap.org).
// CARTO's raster basemaps, used before, now require an API key (#83).
const OFM_ATTR = `OpenFreeMap © OpenMapTiles ${OSM_ATTR}`;
const ofm = (style: string): string => `https://tiles.openfreemap.org/styles/${style}`;

export const BASEMAPS: Basemap[] = [
  {
    id: "ofm-positron",
    label: "Positron (light)",
    provider: "OpenFreeMap",
    styleUrl: ofm("positron"),
    attribution: OFM_ATTR,
  },
  {
    id: "ofm-dark",
    label: "Dark",
    provider: "OpenFreeMap",
    styleUrl: ofm("dark"),
    attribution: OFM_ATTR,
  },
  {
    id: "ofm-liberty",
    label: "Liberty",
    provider: "OpenFreeMap",
    styleUrl: ofm("liberty"),
    attribution: OFM_ATTR,
  },
  {
    id: "osm",
    label: "Standard",
    provider: "OSM",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: OSM_ATTR,
  },
  {
    id: "esri-imagery",
    label: "World Imagery (satellite)",
    provider: "ESRI",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },
  {
    id: "esri-street",
    label: "World Street Map",
    provider: "ESRI",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS",
  },
  {
    id: "none",
    label: "None",
    provider: "None",
    attribution: "",
  },
];

const DEFAULT_ID = "ofm-positron";
const STORAGE_KEY = "gis.basemap.id";

// Every source/layer id we own in the map style carries this prefix.
const PREFIX = "gis-basemap";

function readStored(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && BASEMAPS.some((b) => b.id === v)) return v;
  } catch {
    // ignore: private-mode / storage-disabled — fall back to the default
  }
  return DEFAULT_ID;
}

let activeId = readStored();
const listeners = new Set<() => void>();

function byId(id: string): Basemap | undefined {
  return BASEMAPS.find((b) => b.id === id);
}

// Fetched style JSON, by URL (switching back to a style doesn't refetch it).
const styleCache = new Map<string, Promise<StyleSpecification>>();
function fetchStyle(url: string): Promise<StyleSpecification> {
  let p = styleCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`basemap style ${url}: HTTP ${r.status}`);
      return r.json() as Promise<StyleSpecification>;
    });
    p.catch(() => styleCache.delete(url)); // retry on the next switch
    styleCache.set(url, p);
  }
  return p;
}

// The basemap sources/layers currently in the map style, and a counter that
// lets a slow style fetch notice it has been superseded by a later switch.
let ownedLayers: string[] = [];
let ownedSources: string[] = [];
let applySeq = 0;

function removeOwned(map: maplibregl.Map): void {
  for (const id of ownedLayers) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ownedSources) if (map.getSource(id)) map.removeSource(id);
  ownedLayers = [];
  ownedSources = [];
}

/** Add layers in order, all beneath the current bottom (data) layer. */
function addBeneathData(map: maplibregl.Map, layers: LayerSpecification[]): void {
  const first = map.getStyle().layers?.[0]?.id;
  for (const layer of layers) {
    map.addLayer(layer, first);
    ownedLayers.push(layer.id);
  }
}

function addRaster(map: maplibregl.Map, b: Basemap, tiles: string[]): void {
  map.addSource(PREFIX, {
    type: "raster",
    tiles,
    tileSize: b.tileSize ?? 256,
    attribution: b.attribution,
  });
  ownedSources.push(PREFIX);
  addBeneathData(map, [{ id: PREFIX, type: "raster", source: PREFIX }]);
}

function addStyle(map: maplibregl.Map, b: Basemap, style: StyleSpecification): void {
  // Data layers draw no labels or icons, so the basemap's fonts and sprite can
  // own the map-level glyphs/sprite.
  if (style.glyphs) map.setGlyphs(style.glyphs);
  if (typeof style.sprite === "string") map.setSprite(style.sprite);
  const sourceId = (id: string) => `${PREFIX}:${id}`;
  for (const [id, source] of Object.entries(style.sources)) {
    map.addSource(sourceId(id), { ...source, attribution: b.attribution } as never);
    ownedSources.push(sourceId(id));
  }
  addBeneathData(
    map,
    style.layers.map(
      (layer) =>
        ({
          ...layer,
          id: `${PREFIX}:${layer.id}`,
          ...("source" in layer && typeof layer.source === "string"
            ? { source: sourceId(layer.source) }
            : {}),
        }) as LayerSpecification,
    ),
  );
}

/**
 * Remove the current basemap and add the chosen one at the bottom of the style
 * (below every data layer). "None" leaves nothing behind. Safe to call before
 * the style has loaded, and while a previous switch is still fetching its style
 * (the later switch wins).
 */
export function applyBasemap(map: maplibregl.Map | null, id: string): void {
  if (!map) return;
  const seq = ++applySeq;
  const b = byId(id);
  const stylePromise = b?.styleUrl ? fetchStyle(b.styleUrl) : null;
  void whenStyleReady(map, () => {
    if (!stylePromise) {
      removeOwned(map);
      if (b?.tiles) addRaster(map, b, b.tiles);
      return;
    }
    stylePromise
      .then((style) => {
        if (seq !== applySeq) return; // superseded by a later switch
        removeOwned(map);
        addStyle(map, b!, style);
      })
      .catch((e) => console.error("[basemap]", e));
  });
}

// Tiny subscribe/notify store for the active basemap id (mirrors the app's
// other lightweight stores; snapshot is the id string for useSyncExternalStore).
export const basemap = {
  get id(): string {
    return activeId;
  },
  current(): Basemap {
    return byId(activeId) ?? BASEMAPS[0];
  },
  /** Apply the default (or persisted) basemap to a freshly-created map. */
  applyInitial(map: maplibregl.Map): void {
    applyBasemap(map, activeId);
  },
  set(id: string): void {
    if (!byId(id) || id === activeId) return;
    activeId = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore: storage disabled — selection just stays session-only
    }
    applyBasemap(getMap(), id);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  getSnapshot(): string {
    return activeId;
  },
};

/**
 * The shared provider menu (grouped by vendor via section headers). Both the
 * Browser-pane entry and the pinned Layers row render this same list, so there
 * is one basemap-menu definition. The active basemap is marked with a ✓.
 */
export function basemapMenuItems(): MenuItem[] {
  const items: MenuItem[] = [];
  let lastProvider: BasemapProvider | null = null;
  for (const b of BASEMAPS) {
    if (b.provider !== "None" && b.provider !== lastProvider) {
      items.push({ label: b.provider, header: true });
      lastProvider = b.provider;
    }
    items.push({
      label: b.label,
      checked: b.id === activeId,
      onSelect: () => basemap.set(b.id),
    });
  }
  return items;
}
