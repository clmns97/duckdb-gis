import maplibregl from "maplibre-gl";

// Minimal registry so render paths can reach the single map instance without
// prop-drilling. One map instance per app.
let mapRef: maplibregl.Map | null = null;

export function setMap(m: maplibregl.Map | null) {
  mapRef = m;
}

export function getMap(): maplibregl.Map | null {
  return mapRef;
}

// `map.isStyleLoaded()` flips back to false whenever a source has tiles in
// flight, so a naive `map.once("load", …)` fallback waits on a `load` event
// that already fired (e.g. adding a layer while basemap tiles are loading
// hangs it forever). Track, per map, that the initial style has loaded once,
// then apply directly: adding sources/layers is safe any time after that.
const readyMaps = new WeakSet<maplibregl.Map>();

export function whenStyleReady(map: maplibregl.Map, cb: () => void): Promise<void> {
  if (readyMaps.has(map) || map.isStyleLoaded()) {
    readyMaps.add(map);
    cb();
    return Promise.resolve();
  }
  return new Promise((res) =>
    map.once("load", () => {
      readyMaps.add(map);
      cb();
      res();
    }),
  );
}

/** Frame the map on a lon/lat extent (no-op without a map or bounds). */
export function fitBounds(bounds: [number, number, number, number] | null): void {
  if (!mapRef || !bounds) return;
  const [xmin, ymin, xmax, ymax] = bounds;
  // A fixed padding wider than half the map makes MapLibre skip the fit ("Map
  // cannot fit within canvas"), as on a phone, where the map is ~100px wide.
  const { clientWidth: w, clientHeight: h } = mapRef.getContainer();
  mapRef.fitBounds(
    [
      [xmin, ymin],
      [xmax, ymax],
    ],
    { padding: Math.min(60, Math.floor(Math.min(w, h) / 5)), maxZoom: 14, duration: 600 },
  );
}
