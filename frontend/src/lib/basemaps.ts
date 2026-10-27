// ---------------------------------------------------------------------------
// Basemaps (T-033).
//
// A switchable basemap sits *underneath* all data layers. The catalog is plain
// data so adding a provider is one entry. Switching never calls
// `map.setStyle()` — that wipes every source/layer (our deck.gl overlay and
// ST_AsMVT sources included). Instead the basemap's sources and layers are
// inserted at the very bottom of the style, and swapped by removing/re-adding
// just that group (`applyBasemap`), leaving data layers alone. A basemap is
// XYZ raster tiles (one source + layer), a MapLibre style URL, or a style built
// here (the offline Natural Earth default); a style's sources/layers are copied
// in under an id prefix.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { MenuItem } from "../components/ContextMenu";
import { getMap, whenStyleReady } from "./mapBus";

export type BasemapProvider = "Natural Earth" | "OpenFreeMap" | "OSM" | "ESRI" | "None";

export interface Basemap {
  id: string;
  label: string;
  provider: BasemapProvider;
  /** XYZ raster tile URL templates (a raster basemap). */
  tiles?: string[];
  /** MapLibre style JSON URL (a vector basemap). */
  styleUrl?: string;
  /** A MapLibre style built here (an offline basemap). */
  style?: () => StyleSpecification;
  /** None of `tiles`, `styleUrl` or `style`: "no basemap". */
  attribution: string;
  tileSize?: number;
}

// Offline default (#85): Natural Earth 1:50m land, lakes and country borders
// (public domain), built by scripts/build_natural_earth.py into frontend/public
// and embedded in the extension with the rest of the app, so the map needs no
// network. No labels: those would need fonts from a server.
interface NaturalEarthPalette {
  water: string;
  land: string;
  coast: string;
  border: string;
  graticule: string;
}

const neData = (name: string): string =>
  new URL(`basemaps/natural-earth/${name}.json`, document.baseURI).href;

// Meridians and parallels every `step` degrees, within Web Mercator's latitudes.
function graticule(step: number): GeoJSON.FeatureCollection {
  const line = (coordinates: [number, number][]): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  });
  const features: GeoJSON.Feature[] = [];
  for (let lon = -180; lon <= 180; lon += step) features.push(line([[lon, -85], [lon, 85]]));
  for (let lat = -90 + step; lat < 90; lat += step) features.push(line([[-180, lat], [180, lat]]));
  return { type: "FeatureCollection", features };
}

function naturalEarth(p: NaturalEarthPalette): () => StyleSpecification {
  // Thin lines at world scale, thickening as the map zooms in.
  const width = (from: number, to: number) =>
    ["interpolate", ["linear"], ["zoom"], 0, from, 7, to] as unknown as number;
  return () => ({
    version: 8,
    sources: {
      // GeoJSON tiles past z8 add nothing at 1:50m; overzoom them instead.
      land: { type: "geojson", data: neData("land"), maxzoom: 8 },
      lakes: { type: "geojson", data: neData("lakes"), maxzoom: 8 },
      borders: { type: "geojson", data: neData("borders"), maxzoom: 8 },
      graticule: { type: "geojson", data: graticule(15), maxzoom: 4 },
    },
    layers: [
      { id: "water", type: "background", paint: { "background-color": p.water } },
      { id: "graticule", type: "line", source: "graticule", paint: { "line-color": p.graticule, "line-width": 0.6 } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": p.land } },
      { id: "lakes", type: "fill", source: "lakes", paint: { "fill-color": p.water } },
      { id: "coast", type: "line", source: "land", paint: { "line-color": p.coast, "line-width": width(0.4, 1) } },
      { id: "lake-shore", type: "line", source: "lakes", paint: { "line-color": p.coast, "line-width": width(0.3, 0.8) } },
      { id: "borders", type: "line", source: "borders", paint: { "line-color": p.border, "line-width": width(0.5, 1.2) } },
    ],
  });
}

const OSM_ATTR = "© OpenStreetMap contributors";
// OpenFreeMap: free, no API key or registration (https://openfreemap.org).
// CARTO's raster basemaps, used before, now require an API key (#83).
const OFM_ATTR = `OpenFreeMap © OpenMapTiles ${OSM_ATTR}`;
const ofm = (style: string): string => `https://tiles.openfreemap.org/styles/${style}`;

export const BASEMAPS: Basemap[] = [
  {
    id: "ne-light",
    label: "Light (offline)",
    provider: "Natural Earth",
    style: naturalEarth({
      water: "#d5dfe8",
      land: "#f6f5f1",
      coast: "#b4bfc9",
      border: "#c2bcb2",
      graticule: "rgba(110, 130, 150, 0.22)",
    }),
    attribution: "Made with Natural Earth",
  },
  {
    id: "ne-dark",
    label: "Dark (offline)",
    provider: "Natural Earth",
    style: naturalEarth({
      water: "#1b2129",
      land: "#2d333b",
      coast: "#47515c",
      border: "#58626d",
      graticule: "rgba(150, 170, 190, 0.16)",
    }),
    attribution: "Made with Natural Earth",
  },
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

const DEFAULT_ID = "ne-light";
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
  const stylePromise = b?.styleUrl
    ? fetchStyle(b.styleUrl)
    : b?.style
      ? Promise.resolve(b.style())
      : null;
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
