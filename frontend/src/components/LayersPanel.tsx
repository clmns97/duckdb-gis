import { useState, useSyncExternalStore } from "react";
import { layers, type ActiveLayer } from "../lib/layers";
import { openAttributes } from "../lib/dockBus";
import { basemap, basemapMenuItems } from "../lib/basemaps";
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
  // Re-render when the basemap changes so the pinned row reflects it.
  useSyncExternalStore(basemap.subscribe, basemap.getSnapshot);
  const list = layers.list();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [propsId, setPropsId] = useState<string | null>(null);
  // Drag-to-reorder z-order (T-031). `dragId` is the row being dragged; `dropAt`
  // is the insertion point (0 = above the first row … list.length = below the
  // last), rendered as an accent bar. Native HTML5 drag — no dnd dependency.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const resetDrag = () => {
    setDragId(null);
    setDropAt(null);
  };

  // Insertion point for the row under the cursor: its top half drops *before*
  // the row, its bottom half *after* it.
  const overRow = (e: React.DragEvent, index: number) => {
    if (dragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropAt(after ? index + 1 : index);
  };

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId != null && dropAt != null) layers.reorder(dragId, dropAt);
    resetDrag();
  };

  // Right-click a layer → layer actions, reusing the shared ContextMenu (T-022).
  // "Zoom to layer" (QGIS "Zoom to Layer(s)") is disabled until the layer has a
  // valid extent (still loading, or empty / all-NULL geometry) so it never flies
  // to NaN bounds; "Layer properties…" opens the Information/Symbology dialog.
  const openLayerMenu = (e: React.MouseEvent, layer: ActiveLayer) => {
    e.preventDefault();
    const items: MenuItem[] = [
      {
        label: layer.visible ? "Hide layer" : "Show layer",
        onSelect: () => layers.setVisible(layer.id, !layer.visible),
      },
      {
        label: "Zoom to layer",
        disabled: layer.status !== "ready" || layer.bounds == null,
        onSelect: () => layers.zoomTo(layer.id),
      },
      {
        label: "Open attribute table",
        // Query-backed layers (Overture / SQL result) have no catalog source to
        // page yet (T-026 v1) — only catalog tables get a browsable grid.
        disabled: !layer.source,
        onSelect: () => openAttributes(layer),
      },
      {
        label: "Layer properties…",
        onSelect: () => setPropsId(layer.id),
      },
    ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Right-click the pinned basemap row → "Change Basemap" flyout of providers.
  // The basemap always sits below data layers, so this row is fixed (not part of
  // the reorderable list) and its menu shares one definition with the Browser
  // entry (`basemapMenuItems`).
  const openBasemapMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: "Change Basemap", children: basemapMenuItems() }],
    });
  };

  return (
    <>
    {list.length === 0 ? (
      <p className="mt-0.5 text-editor text-gray-500 italic">No layers yet</p>
    ) : (
    <ul className="list-none m-0 p-0">
      {list.map((layer, index) => (
        <li
          key={layer.id}
          className={`relative flex items-center gap-1.5 px-1 py-[3px] rounded-md text-editor hover:bg-gray-200 ${
            layer.status === "loading" ? "text-gray-500" : ""
          } ${dragId === layer.id ? "opacity-50" : ""}`}
          title="Drag to reorder · right-click for layer actions"
          draggable
          onDragStart={(e) => {
            setDragId(layer.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", layer.id);
          }}
          onDragOver={(e) => overRow(e, index)}
          onDrop={drop}
          onDragEnd={resetDrag}
          onContextMenu={(e) => openLayerMenu(e, layer)}
        >
          {dropAt === index && (
            <span className="pointer-events-none absolute left-0 right-0 -top-px h-0.5 rounded bg-accent" />
          )}
          {index === list.length - 1 && dropAt === list.length && (
            <span className="pointer-events-none absolute left-0 right-0 -bottom-px h-0.5 rounded bg-accent" />
          )}
          <span
            className="w-3 h-3 shrink-0 rounded-[3px] bg-primary border border-accent cursor-grab"
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
          {layer.temporary && (
            <span
              className="shrink-0 rounded bg-subtle border border-gray-200 px-1 text-[10px] leading-tight text-gray-500 uppercase tracking-wide"
              title="Temporary layer — the SQL editor Run result, not persisted"
            >
              temp
            </span>
          )}
          {!layer.visible && layer.status === "ready" && (
            <span className="shrink-0 text-xs text-gray-500" title="Hidden">
              hidden
            </span>
          )}
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
            draggable={false}
            onClick={() => layers.remove(layer.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
    )}
    {/* Basemap — pinned below all data layers, not draggable / reorderable. */}
    <div
      className="mt-1 pt-1.5 border-t border-gray-200 flex items-center gap-1.5 px-1 py-[3px] rounded-md text-editor text-gray-500 cursor-context-menu hover:bg-gray-200"
      title="Basemap — right-click to change (always below data layers)"
      onContextMenu={openBasemapMenu}
    >
      <span
        className="w-3 h-3 shrink-0 rounded-[3px] border-[1.5px] border-gray-400"
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {basemap.current().label}
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">basemap</span>
    </div>
    {menu && (
      <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
    )}
    {propsId && (
      <LayerProperties layerId={propsId} onClose={() => setPropsId(null)} />
    )}
    </>
  );
}
