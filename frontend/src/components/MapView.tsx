import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { setMap } from "../lib/mapBus";

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      // Placeholder basemap; real layers will come from native DuckDB
      // (ST_AsMVT via a custom protocol) and PMTiles in later phases.
      style: "https://demotiles.maplibre.org/style.json",
      center: [8.54, 47.37], // Zürich
      zoom: 4,
      attributionControl: { compact: true },
    });
    // Shift-click is our additive-selection gesture (see deckRender picking).
    // MapLibre's shift+drag box-zoom otherwise swallows the shift+mousedown, so
    // deck.gl never computes a pick — disable it so selection wins the modifier.
    map.boxZoom.disable();
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    // MapLibre swallows tile/source failures (custom-protocol errors included)
    // into its `error` event — surface them or tile bugs are invisible.
    map.on("error", (e) => console.error("[maplibre]", e.error ?? e));
    setMap(map);
    return () => {
      setMap(null);
      map.remove();
    };
  }, []);

  return <div className="map" ref={ref} />;
}
