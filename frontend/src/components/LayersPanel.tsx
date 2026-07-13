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

  if (list.length === 0) return <p className="empty">No layers yet</p>;

  return (
    <>
    <ul className="layer-list">
      {list.map((layer) => (
        <li
          key={layer.id}
          className={`layer-row status-${layer.status}`}
          title="Right-click for layer actions"
          onContextMenu={(e) => openLayerMenu(e, layer)}
        >
          <span className="layer-swatch" aria-hidden="true" />
          <span
            className="layer-name"
            title={
              layer.source
                ? `${layer.source.schema}.${layer.name} (${layer.source.geomColumn})`
                : layer.name
            }
          >
            {layer.name}
          </span>
          {layer.status === "loading" && <span className="layer-note">loading…</span>}
          {layer.status === "error" && (
            <span className="layer-note err" title={layer.error}>
              failed
            </span>
          )}
          <button
            className="layer-remove"
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
