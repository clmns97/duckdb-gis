import { useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, GripVertical, X, Map as MapIcon, EllipsisVertical } from "lucide-react";
import { layers, type ActiveLayer } from "../lib/layers";
import { editing } from "../lib/editing";
import { errMsg } from "../lib/duckdb";
import { openAttributes } from "../lib/dockBus";
import { basemap, basemapMenuItems } from "../lib/basemaps";
import { ContextMenu, type MenuItem, type MenuState } from "./ContextMenu";
import { LayerProperties } from "./LayerProperties";
import { SymbologyGlyph } from "./SymbologyGlyph";
import { ROW_BASE, LEAD_SLOT, GLYPH_SLOT, KEBAB_SLOT, REMOVE_SLOT } from "./rowSlots";

// Row column template (LEAD/GLYPH/KEBAB/REMOVE slots) is shared with the Browser
// tree via ./rowSlots so the leading glyphs and ⋮ kebabs line up across panels.

// The Layers panel body: one row per active layer (T-021), or the empty state.
// Subscribes to the active-layers store; `version` is the external snapshot
// (a fresh `list()` array would otherwise trip the identity check), mirroring
// SelectionChip.
export function LayersPanel() {
  const version = useSyncExternalStore(layers.subscribe, () => layers.version);
  void version; // read so the component re-renders on store changes
  // Re-render when the basemap changes so the pinned row reflects it.
  useSyncExternalStore(basemap.subscribe, basemap.getSnapshot);
  // Re-render on editing changes so the "Toggle/Stop editing" menu label and the
  // per-row editing badge stay in sync (T-038).
  useSyncExternalStore(editing.subscribe, () => editing.version);
  const list = layers.list();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Inline surface for a failed "Toggle editing" (e.g. layer too large / still
  // loading) — the context menu has nowhere to show an error.
  const [editErr, setEditErr] = useState<string | null>(null);
  const [propsId, setPropsId] = useState<string | null>(null);
  // Drag-to-reorder z-order (T-031). `dragId` is the row being dragged; `dropAt`
  // is the insertion point (0 = above the first row … list.length = below the
  // last), rendered as an accent bar. Native HTML5 drag — no dnd dependency.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // Persistent selected-row highlight = the store's active layer (QGIS's active
  // layer), shared with layer-scoped map controls like the Edit button (T-038).
  const selectedId = layers.activeId;

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
    // Feature editing (T-038): only catalog-table layers can be edited in place;
    // while editing one layer, the item is disabled on the others.
    const editingThis = editing.target?.kind === "existing" && editing.target.layerId === layer.id;
    const editingElsewhere = editing.isEditing() && !editingThis;
    const items: MenuItem[] = [
      {
        label: editingThis ? "Stop editing" : "Toggle editing",
        disabled: !layer.source || layer.status !== "ready" || editingElsewhere,
        onSelect: () => {
          setEditErr(null);
          if (editingThis) editing.finishEdit();
          else editing.beginEdit(layer).catch((err) => setEditErr(errMsg(err)));
        },
      },
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
      {
        label: "Remove layer",
        onSelect: () => layers.remove(layer.id),
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
    {editErr && (
      <button
        type="button"
        className="block w-full text-left mb-1.5 px-2 py-1 text-xs text-danger bg-red-50 border border-red-200 rounded-sm cursor-pointer"
        title="Dismiss"
        onClick={() => setEditErr(null)}
      >
        {editErr}
      </button>
    )}
    {list.length === 0 ? (
      <p className="mt-0.5 text-editor text-gray-500 italic">No layers yet</p>
    ) : (
    <ul className="list-none m-0 p-0 -mx-3">
      {list.map((layer, index) => {
        const dim =
          layer.status === "loading" || (!layer.visible && layer.status === "ready");
        return (
        <li
          key={layer.id}
          className={`group relative ${ROW_BASE} pl-3 select-none ${
            dim ? "text-gray-500" : ""
          } ${dragId === layer.id ? "opacity-50" : ""} ${
            selectedId === layer.id ? "bg-gray-100" : ""
          }`}
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
          onClick={() => layers.setActive(layer.id)}
          onContextMenu={(e) => openLayerMenu(e, layer)}
        >
          {dropAt === index && (
            <span className="pointer-events-none absolute left-0 right-0 -top-px h-0.5 rounded bg-accent" />
          )}
          {index === list.length - 1 && dropAt === list.length && (
            <span className="pointer-events-none absolute left-0 right-0 -bottom-px h-0.5 rounded bg-accent" />
          )}
          <button
            className={`${LEAD_SLOT} text-gray-500 cursor-pointer hover:text-gray-900 disabled:opacity-40 disabled:cursor-default`}
            title={layer.visible ? "Hide layer" : "Show layer"}
            aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
            disabled={layer.status !== "ready"}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              layers.setVisible(layer.id, !layer.visible);
            }}
          >
            {layer.visible ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
          </button>
          <span className={GLYPH_SLOT}>
            <SymbologyGlyph kind={layer.geometryKind} style={layer.style} />
          </span>
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
          {editing.target?.kind === "existing" && editing.target.layerId === layer.id && (
            <span
              className="shrink-0 rounded bg-subtle border border-accent px-1 text-[10px] leading-tight text-accent uppercase tracking-wide"
              title="Editing this layer — use the map toolbar to edit vertices, then Save"
            >
              editing
            </span>
          )}
          {layer.temporary && (
            <span
              className="shrink-0 rounded bg-subtle border border-gray-200 px-1 text-[10px] leading-tight text-gray-500 uppercase tracking-wide"
              title="Temporary layer — the SQL editor Run result, not persisted"
            >
              temp
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
          <GripVertical
            size={14}
            strokeWidth={2}
            className="shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab"
            aria-hidden="true"
          />
          <button
            className={KEBAB_SLOT}
            title="Layer actions"
            aria-label={`Actions for ${layer.name}`}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              openLayerMenu(e, layer);
            }}
          >
            <EllipsisVertical size={15} strokeWidth={2} />
          </button>
          <button
            className={`${REMOVE_SLOT} grid place-items-center rounded text-gray-500 cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-white hover:text-gray-900`}
            title="Remove layer"
            aria-label={`Remove ${layer.name}`}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              layers.remove(layer.id);
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </li>
        );
      })}
    </ul>
    )}
    {/* Basemap — pinned below all data layers, not draggable / reorderable. */}
    <div className="-mx-3 mt-1 pt-1 border-t border-gray-200">
      <div
        className={`${ROW_BASE} pl-3 text-gray-500 cursor-context-menu`}
        title="Basemap — right-click (or ⋮) to change (always below data layers)"
        onContextMenu={openBasemapMenu}
      >
        <span className={LEAD_SLOT} aria-hidden="true">
          <MapIcon size={14} strokeWidth={2} />
        </span>
        {/* No symbology glyph for the basemap — hold the column so the name lines
            up with data-layer rows. */}
        <span className={GLYPH_SLOT} aria-hidden="true" />
        <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {basemap.current().label}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">basemap</span>
        <button
          className={KEBAB_SLOT}
          title="Change basemap"
          aria-label="Change basemap"
          onClick={openBasemapMenu}
        >
          <EllipsisVertical size={15} strokeWidth={2} />
        </button>
        {/* No remove action — hold the X-remove column so the ⋮ above lines up
            with the data-layer rows' ⋮. */}
        <span className={REMOVE_SLOT} aria-hidden="true" />
      </div>
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
