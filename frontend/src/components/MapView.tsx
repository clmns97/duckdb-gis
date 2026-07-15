import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { setMap } from "../lib/mapBus";
import { basemap } from "../lib/basemaps";

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      // Empty style; the basemap (T-033) is added as a raster source/layer at
      // the bottom, and data layers come from native DuckDB (ST_AsMVT via a
      // custom protocol / GeoArrow deck.gl overlay).
      style: { version: 8, sources: {}, layers: [] },
      center: [8.54, 47.37], // Zürich
      zoom: 4,
      attributionControl: { compact: true },
    });
    // Add the default / last-chosen basemap once the (empty) style is ready.
    basemap.applyInitial(map);
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

  return <div className="absolute inset-0" ref={ref} />;
}
