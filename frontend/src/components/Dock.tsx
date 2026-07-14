import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview";
import "dockview/dist/styles/dockview.css";
import { MapPanel } from "./panels/MapPanel";
import { AttributesPanel } from "./panels/AttributesPanel";
import { EditorPanel } from "./EditorPanel";
import { setDockApi } from "../lib/dockBus";

// The dockable workspace (T-005). The map and the SQL editor are dock panels in
// a Dockview layout: the map fills the canvas and the editor docks below it by
// default. Either can be dragged into the other's group, tabbed, floated, split,
// or collapsed via the group splitters — the QGIS-style "reclaim the space"
// pattern. Future attribute tables (T-026) register as additional panel
// components and open as tabs in this same dock.
//
// `defaultRenderer: "always"` keeps every panel's DOM mounted (hidden, not
// detached, when its tab is inactive) so the live MapLibre map and CodeMirror
// editor survive tab switches and re-docking without being torn down.

// Dockview panel components are keyed by the `component` string passed to
// `addPanel`. `EditorPanel` ignores dock props; wrap it to satisfy the type.
const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  map: MapPanel,
  editor: () => <EditorPanel />,
  // Attribute tables (T-026): one panel per layer, opened via dockBus.
  attributes: AttributesPanel,
};

function onReady(event: DockviewReadyEvent) {
  // Expose the dock api so the Layers panel can open attribute-table tabs
  // (T-026) without prop-drilling — mirrors mapBus.
  setDockApi(event.api);
  const map = event.api.addPanel({
    id: "map",
    component: "map",
    title: "Map",
  });
  event.api.addPanel({
    id: "editor",
    component: "editor",
    title: "SQL Editor",
    position: { referencePanel: map.id, direction: "below" },
    // Map-dominant default (~the old fixed editor height); the splitter and
    // group collapse let the user reclaim the space either way.
    initialHeight: 240,
  });
}

export function Dock() {
  return (
    <DockviewReact
      className="dock-root dockview-theme-light flex-1 min-h-0"
      components={components}
      defaultRenderer="always"
      onReady={onReady}
    />
  );
}
