import { useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, GripVertical, X, Map as MapIcon, EllipsisVertical } from "lucide-react";
import { layers, type ActiveLayer } from "../lib/layers";
import { openAttributes } from "../lib/dockBus";
import { basemap, basemapMenuItems } from "../lib/basemaps";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { LayerProperties } from "./LayerProperties";
import { SymbologyGlyph } from "./SymbologyGlyph";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

// Shared row column template (T-037): data-layer rows and the pinned basemap row
// use the same fixed-width slots — a leading icon, a symbology-glyph slot, the
// flexible name, then a trailing ⋮ actions column — so the ⋮ kebabs and leading
// glyphs line up across both. A row lacking a given control renders an empty
// spacer of the same width to hold the column (the X-remove slot in particular
// keeps every ⋮ in the same x-position). Any future pinned row reuses these.
const LEAD_SLOT = "w-4 h-4 shrink-0 grid place-items-center"; // eye toggle / basemap icon
const GLYPH_SLOT = "w-3 shrink-0"; // symbology glyph (SymbologyGlyph is w-3) / spacer
const KEBAB_SLOT =
  "w-6 h-6 grid place-items-center shrink-0 rounded text-gray-400 cursor-pointer hover:bg-white hover:text-gray-900";
const REMOVE_SLOT = "w-4 h-4 shrink-0"; // X-remove button / spacer

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
  // Persistent selected-row highlight (matches the DuckDB tree selection).
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          className={`group relative flex items-center gap-1.5 h-7 pl-2 pr-1 text-editor select-none hover:bg-gray-100 ${
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
          onClick={() => setSelectedId(layer.id)}
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
          <SymbologyGlyph kind={layer.geometryKind} style={layer.style} />
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
        className="flex items-center gap-1.5 h-7 pl-2 pr-1 text-editor text-gray-500 cursor-context-menu hover:bg-gray-100"
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
