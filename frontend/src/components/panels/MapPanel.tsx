import { useEffect } from "react";
import type { IDockviewPanelProps } from "dockview";
import { MapView } from "../MapView";
import { SelectionChip } from "../SelectionChip";
import { getMap } from "../../lib/mapBus";

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

  return (
    <div className="map-wrap">
      <MapView />
      <SelectionChip />
    </div>
  );
}
