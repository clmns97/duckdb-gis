import { useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";
import { MapView } from "../MapView";
import { SelectionChip } from "../SelectionChip";
import { DrawToolbar } from "../DrawToolbar";
import { getMap } from "../../lib/mapBus";
import { editing } from "../../lib/editing";

// The map as a dock panel. MapLibre is created once in `MapView` and kept alive
// across tab switches / re-docking (the dock uses `defaultRenderer: "always"`,
// so the panel DOM is hidden rather than unmounted). When the panel is resized
// or re-docked, MapLibre must be told to re-measure or it renders at a stale
// size — wire the panel's dimension change to `map.resize()`.
export function MapPanel(props: IDockviewPanelProps) {
  useEffect(() => {
    const disposable = props.api.onDidDimensionsChange(() => {
      getMap()?.resize();
    });
    return () => disposable.dispose();
  }, [props.api]);

  // Tear the Terra Draw instance (T-025) down with the panel so it doesn't hold
  // a stale map reference across an unmount / HMR.
  useEffect(() => () => editing.destroy(), []);

  // The `map-wrap` class is the hook for the unlayered MapLibre overrides in
  // global.css (canvas fill + control chrome) — those can't be Tailwind
  // utilities because maplibre-gl.css is unlayered and would win.
  return (
    <div className="map-wrap relative w-full h-full min-h-0">
      <MapView />
      <DrawToolbar />
      <SelectionChip />
    </div>
  );
}
