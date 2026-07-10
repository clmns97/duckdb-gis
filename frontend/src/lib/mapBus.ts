import maplibregl from "maplibre-gl";

// Minimal registry so render paths can reach the single map instance without
// prop-drilling. One map instance per app.
let mapRef: maplibregl.Map | null = null;

export function setMap(m: maplibregl.Map | null) {
  mapRef = m;
}

// Shared accessor so render paths (the Arrow/deck.gl overlay, the ST_AsMVT tile
// renderer) can reach the single map instance without prop-drilling.
export function getMap(): maplibregl.Map | null {
  return mapRef;
}
