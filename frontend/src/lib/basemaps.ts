// ---------------------------------------------------------------------------
// Basemaps (T-033).
//
// A switchable raster basemap sits *underneath* all data layers. The catalog is
// plain data so adding a provider is one entry. Switching never calls
// `map.setStyle()` — that wipes every source/layer (our deck.gl overlay and
// ST_AsMVT sources included). Instead we keep the basemap as a single raster
// source + raster layer inserted at the very bottom of the style, and swap it by
// removing/re-adding just that pair (`applyBasemap`), leaving data layers alone.
// ---------------------------------------------------------------------------

import type { MenuItem } from "../components/ContextMenu";
import { getMap } from "./mapBus";

export type BasemapProvider = "OSM" | "CARTO" | "ESRI" | "None";

export interface Basemap {
  id: string;
  label: string;
  provider: BasemapProvider;
  /** XYZ raster tile URL templates, or null for "no basemap". */
  tiles: string[] | null;
  attribution: string;
  tileSize?: number;
}

// CARTO serves from four subdomains; MapLibre has no `{s}` token, so expand
// them into an explicit tiles array (retina `{r}` dropped — standard tiles).
const carto = (name: string): string[] =>
  ["a", "b", "c", "d"].map(
    (s) => `https://${s}.basemaps.cartocdn.com/${name}/{z}/{x}/{y}.png`,
  );

const OSM_ATTR = "© OpenStreetMap contributors";
const CARTO_ATTR = `${OSM_ATTR} © CARTO`;

export const BASEMAPS: Basemap[] = [
  {
    id: "osm",
    label: "Standard",
    provider: "OSM",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: OSM_ATTR,
  },
  {
    id: "carto-positron",
    label: "Positron (light)",
    provider: "CARTO",
    tiles: carto("light_all"),
    attribution: CARTO_ATTR,
  },
  {
    id: "carto-dark",
    label: "Dark Matter",
    provider: "CARTO",
    tiles: carto("dark_all"),
    attribution: CARTO_ATTR,
  },
  {
    id: "carto-voyager",
    label: "Voyager",
    provider: "CARTO",
    tiles: carto("rastertiles/voyager"),
    attribution: CARTO_ATTR,
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
    tiles: null,
    attribution: "",
  },
];

const DEFAULT_ID = "carto-positron";
const STORAGE_KEY = "gis.basemap.id";

// Fixed ids for the single basemap source+layer we own in the map style.
const SRC_ID = "gis-basemap";
const LAYER_ID = "gis-basemap";

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

/**
 * Remove the current basemap source/layer and add the chosen one at the bottom
 * of the style (below every data layer). "None" leaves nothing behind. Safe to
 * call before the style has loaded — it defers to the map's `load` event.
 */
export function applyBasemap(map: maplibregl.Map | null, id: string): void {
  if (!map) return;
  const doApply = () => {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
    const b = byId(id);
    if (!b || !b.tiles) return; // "None" — data layers show on the app background
    map.addSource(SRC_ID, {
      type: "raster",
      tiles: b.tiles,
      tileSize: b.tileSize ?? 256,
      attribution: b.attribution,
    });
    // Insert below the first existing layer so all data layers stay on top.
    const first = map.getStyle().layers?.[0]?.id;
    map.addLayer({ id: LAYER_ID, type: "raster", source: SRC_ID }, first);
  };
  if (map.isStyleLoaded()) doApply();
  else map.once("load", doApply);
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
