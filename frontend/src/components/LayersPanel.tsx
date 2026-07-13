import { useState, useSyncExternalStore } from "react";
import { layers, type ActiveLayer } from "../lib/layers";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { LayerProperties } from "./LayerProperties";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

// The Layers panel body: one row per active layer (T-021), or the empty state.
// Subscribes to the active-layers store; `version` is the external snapshot
// (a fresh `list()` array would otherwise trip the identity check), mirroring
// SelectionChip.
export function LayersPanel() {
  const version = useSyncExternalStore(layers.subscribe, () => layers.version);
  void version; // read so the component re-renders on store changes
  const list = layers.list();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [propsId, setPropsId] = useState<string | null>(null);

  // Right-click a layer → layer actions, reusing the shared ContextMenu (T-022).
  // "Zoom to layer" (QGIS "Zoom to Layer(s)") is disabled until the layer has a
  // valid extent (still loading, or empty / all-NULL geometry) so it never flies
  // to NaN bounds; "Layer properties…" opens the Information/Symbology dialog.
  const openLayerMenu = (e: React.MouseEvent, layer: ActiveLayer) => {
    e.preventDefault();
    const items: MenuItem[] = [
      {
        label: "Zoom to layer",
        disabled: layer.status !== "ready" || layer.bounds == null,
        onSelect: () => layers.zoomTo(layer.id),
      },
      {
        label: "Layer properties…",
        onSelect: () => setPropsId(layer.id),
      },
    ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  if (list.length === 0)
    return <p className="mt-0.5 text-editor text-gray-500 italic">No layers yet</p>;

  return (
    <>
    <ul className="list-none m-0 p-0">
      {list.map((layer) => (
        <li
          key={layer.id}
          className={`flex items-center gap-1.5 px-1 py-[3px] rounded-md text-editor hover:bg-gray-200 ${
            layer.status === "loading" ? "text-gray-500" : ""
          }`}
          title="Right-click for layer actions"
          onContextMenu={(e) => openLayerMenu(e, layer)}
        >
          <span
            className="w-3 h-3 shrink-0 rounded-[3px] bg-primary border border-accent"
            aria-hidden="true"
          />
          <span
            className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
            title={
              layer.source
                ? `${layer.source.schema}.${layer.name} (${layer.source.geomColumn})`
                : layer.name
            }
          >
            {layer.name}
          </span>
          {layer.status === "loading" && (
            <span className="shrink-0 text-xs text-gray-500">loading…</span>
          )}
          {layer.status === "error" && (
            <span className="shrink-0 text-xs text-danger" title={layer.error}>
              failed
            </span>
          )}
          <button
            className="shrink-0 leading-none text-gray-500 px-1 rounded-md cursor-pointer hover:bg-white hover:text-gray-900"
            title="Remove layer"
            aria-label={`Remove ${layer.name}`}
            onClick={() => layers.remove(layer.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
    {menu && (
      <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
    )}
    {propsId && (
      <LayerProperties layerId={propsId} onClose={() => setPropsId(null)} />
    )}
    </>
  );
}
