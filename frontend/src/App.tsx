import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  PanelLeft,
  Layers as LayersIcon,
  Boxes,
  Search,
  Database,
  Workflow,
  Table2,
  Map as MapIcon,
  Plus,
  ChevronRight,
  ChevronDown,
  EllipsisVertical,
} from "lucide-react";
import { Dock } from "./components/Dock";
import { Button } from "./components/Button";
import { LayersPanel } from "./components/LayersPanel";
import { OvertureModal } from "./components/OvertureModal";
import { OvertureLogo } from "./components/OvertureLogo";
import { AttachModal } from "./components/AttachModal";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { loadCatalog, type CatalogDatabase, type CatalogTable } from "./lib/catalog";
import { query } from "./lib/duckdb";
import { getMap } from "./lib/mapBus";
import { addTileLayer, removeTileLayer, prepareTileLayer } from "./lib/tiles";
import { renderGeoArrow, clearDeck } from "./lib/deckRender";
import { selection } from "./lib/selection";
import { layers } from "./lib/layers";
import { editing } from "./lib/editing";
import { attach } from "./lib/attach";
import { basemap, basemapMenuItems } from "./lib/basemaps";
import { TOOLS } from "./lib/geoprocessing";
import {
  OVERTURE_THEMES,
  buildOvertureQuery,
  selectionBbox,
  viewportBbox,
  type OvertureRequest,
} from "./lib/overture";
import { ensureOvertureAccess } from "./lib/remote";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function App() {
  const [databases, setDatabases] = useState<CatalogDatabase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which sidebar panel is forward. Default to Browser: until a Layers UI can
  // populate the Layers panel (T-001/T-021) it's empty, so the catalog is the
  // more useful landing panel.
  const [tab, setTab] = useState<"layers" | "browser">("browser");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [overtureOpen, setOvertureOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // Re-render when the active basemap changes so both the Browser entry label
  // and the pinned Layers row (via LayersPanel) reflect it.
  useSyncExternalStore(basemap.subscribe, basemap.getSnapshot);
  // Left sidebar collapse (T-030). Collapsing hands the reclaimed width to the
  // map; a thin rail keeps the expand affordance visible. Persisted across
  // reloads. Toggle-only for v1 (no drag-resize).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gis.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("gis.sidebar.collapsed", collapsed ? "1" : "0");
    } catch {
      // ignore: private-mode / storage-disabled — collapse just stays session-only
    }
  }, [collapsed]);

  // Reveal a panel from the collapsed rail: expand the sidebar and bring that
  // panel forward in one click.
  const revealTab = (t: "layers" | "browser") => {
    setTab(t);
    setCollapsed(false);
  };

  // Browser tree node open/closed state. We track *collapsed* keys (presence =
  // collapsed) so the default is "everything expanded" — the same all-open tree
  // we had before the chevrons became functional. Keys: `db` and `db›schema`.
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const isOpen = (key: string) => !collapsedNodes.has(key);
  const toggleNode = (key: string) =>
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  // Selected Browser table row (persistent highlight), keyed `db›schema›table`.
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Re-read the live catalog into the Browser tree. Called after an attach /
  // detach so a newly `ATTACH`ed database (and its schemas/tables) shows up, or
  // a detached one drops off, without a page reload.
  const refreshCatalog = () => {
    loadCatalog()
      .then((dbs) => {
        setDatabases(dbs);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Right-click an attached database node → "Detach". Offered only for
  // databases we attached this session (`attach.has`) — never the default /
  // in-memory database. Detaching refreshes the catalog so the node drops off.
  const openDatabaseMenu = (e: React.MouseEvent, db: string) => {
    if (!attach.has(db)) return; // default db: let the native menu through
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Detach",
          onSelect: () => {
            attach
              .detach(db)
              .then(refreshCatalog)
              .catch((err) => setError(err instanceof Error ? err.message : String(err)));
          },
        },
      ],
    });
  };

  // Processing menu (T-004): a dropdown driven by the geoprocessing tool
  // registry, anchored under its header button. A disabled tool shows why it
  // can't run; run() errors surface on the catalog error line.
  const openProcessingMenu = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = TOOLS.map((tool) => {
      const enabled = tool.enabled();
      return {
        label: enabled || !tool.disabledHint ? tool.label : `${tool.label} (${tool.disabledHint})`,
        disabled: !enabled,
        onSelect: () => {
          tool.run().catch((err) => setError(err instanceof Error ? err.message : String(err)));
        },
      };
    });
    setMenu({ x: rect.left, y: rect.bottom + 4, items });
  };

  // Basemap picker (T-033): the Browser-pane entry opens the shared basemap
  // submenu, anchored under the button (same menu the pinned Layers row uses).
  const openBasemapMenu = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4, items: basemapMenuItems() });
  };

  // Right-click a geometry-bearing table → "Add to map" (QGIS "Add Layer").
  // Only spatial tables get the menu (T-001 flagged their geometry columns);
  // one item per geometry column so a multi-geometry table exposes each.
  const openTableMenu = (
    e: React.MouseEvent,
    db: string,
    schema: string,
    table: CatalogTable,
  ) => {
    if (table.geomColumns.length === 0) return; // let the native menu through
    e.preventDefault();
    const multi = table.geomColumns.length > 1;
    const items: MenuItem[] = table.geomColumns.map((col) => ({
      label: multi ? `Add to map (${col})` : "Add to map",
      onSelect: () => {
        setTab("layers");
        void layers.add({ db, schema, table: table.name, geomColumn: col });
      },
    }));
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Overture quick-load (T-012 / T-029): resolve the chosen extent to a bbox,
  // then add one query-backed layer per selected theme. Each theme's remote S3
  // read is materialised into a local temp table *once* (a single S3 scan)
  // before the layer renders from it — the render path otherwise scans the
  // source twice (probe + Arrow), which over the network doubles the wall time.
  // httpfs/S3 setup + the materialise run inside `addQuery`'s `prepare`, so any
  // access or read failure surfaces on the layer row instead of being swallowed.
  const loadOverture = async (req: OvertureRequest) => {
    setTab("layers");
    const bbox = req.extent === "selected" ? await selectionBbox() : viewportBbox();
    if (!bbox) return; // no map / empty selection — nothing to clip to
    for (const themeId of req.themes) {
      const theme = OVERTURE_THEMES.find((t) => t.id === themeId);
      if (!theme) continue;
      const id = `L_ov_${req.release}_${theme.id}`.replace(/[^A-Za-z0-9]/g, "_");
      void layers.addQuery({
        id,
        name: `Overture ${theme.label}`,
        sql: `SELECT geom FROM ${id}`,
        prepare: async () => {
          await ensureOvertureAccess();
          await query(
            `CREATE OR REPLACE TEMP TABLE ${id} AS ${buildOvertureQuery(theme, req.release, bbox)}`,
          );
        },
      });
    }
  };

  useEffect(() => {
    (async () => {
      // Spatial is required for ST_* functions; the arrow extension powers the
      // columnar Arrow-IPC render path (to_arrow_ipc); duck_geoarrow provides the
      // st_asgeoarrow* encoders that feed the GeoArrow deck.gl layers.
      try {
        await query("INSTALL spatial; LOAD spatial;");
        await query("INSTALL arrow FROM community; LOAD arrow;");
        await query("INSTALL duck_geoarrow FROM community; LOAD duck_geoarrow;");
        // Cache parquet metadata across queries so remote reads (Overture on S3,
        // T-029) don't re-fetch file footers each scan — ~10x on repeat reads.
        await query("SET enable_object_cache=true;");
      } catch {
        // ignore; catalog still loads, spatial/arrow queries will report errors
      }
      loadCatalog()
        .then(setDatabases)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    })();
  }, []);

  // Dev seam for the ST_AsMVT tile renderer until a Layers UI lands: drive it
  // from the console / e2e as `gisTiles.prepareTileLayer(...)` + `addTileLayer(...)`.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { gisTiles: unknown }).gisTiles = {
      addTileLayer,
      removeTileLayer,
      prepareTileLayer,
      getMap,
    };
    (window as unknown as { gisDeck: unknown }).gisDeck = {
      renderGeoArrow,
      clearDeck,
    };
    (window as unknown as { gisSelection: unknown }).gisSelection = selection;
    (window as unknown as { gisEditing: unknown }).gisEditing = editing;
    (window as unknown as { gisQuery: unknown }).gisQuery = query;
  }, []);

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 shrink-0 flex items-center gap-2.5 px-4 border-b border-gray-200 bg-white">
        <span
          className="w-[26px] h-[26px] shrink-0 rounded-full bg-black grid place-items-center"
          aria-hidden="true"
        >
          <span className="w-[11px] h-[11px] rounded-full bg-duck-yellow" />
        </span>
        <b className="font-medium text-lg">duckdb-gis</b>
        <span className="flex-1" />
        <Button variant="ghost" onClick={openProcessingMenu} title="Geoprocessing tools">
          Processing
        </Button>
        <Button variant="ghost">Help</Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {collapsed ? (
          <aside className="w-10 shrink-0 border-r border-gray-200 py-2 flex flex-col items-center gap-1">
            <button
              title="Expand panel"
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
              className="w-7 h-7 grid place-items-center rounded-md text-gray-500 cursor-pointer hover:bg-gray-100 hover:text-gray-900"
            >
              <PanelLeft size={16} strokeWidth={2} />
            </button>
            <div className="w-6 border-t border-gray-200 my-1" />
            <RailTab active={tab === "layers"} onClick={() => revealTab("layers")} label="Layers">
              <LayersIcon size={16} strokeWidth={2} />
            </RailTab>
            <RailTab active={tab === "browser"} onClick={() => revealTab("browser")} label="Browser">
              <Boxes size={16} strokeWidth={2} />
            </RailTab>
          </aside>
        ) : (
        <aside className="w-[300px] shrink-0 border-r border-gray-200 p-3 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px]">
          {tab === "layers" ? (
            <section>
              <SectionHeader label="Layers" addTitle="Add layer" />
              <LayersPanel />
            </section>
          ) : (
            <>
              <button
                className="flex items-center gap-1.5 w-full mb-2 px-2 py-1.5 text-editor text-gray-900 text-left bg-subtle border border-gray-200 rounded-md cursor-pointer hover:border-primary-border-active hover:text-accent"
                title="Add Overture Maps data (QuickOSM-style)"
                onClick={() => setOvertureOpen(true)}
              >
                <OvertureLogo size={16} className="shrink-0" />
                <span>Overture Maps</span>
                <span className="ml-auto text-xs text-gray-500">quick load…</span>
              </button>

              <button
                className="flex items-center gap-1.5 w-full mb-2 px-2 py-1.5 text-editor text-gray-900 text-left bg-subtle border border-gray-200 rounded-md cursor-pointer hover:border-primary-border-active hover:text-accent"
                title="Switch the map basemap"
                onClick={openBasemapMenu}
              >
                <MapIcon size={15} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" />
                <span>Basemap</span>
                <span className="ml-auto text-xs text-gray-500">{basemap.current().label}</span>
              </button>

              <div className="flex items-center gap-2 text-gray-500">
                <Search size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search"
                  spellCheck={false}
                  className="w-full border-0 outline-none text-gray-900 bg-transparent"
                />
              </div>

              <section>
                <SectionHeader
                  label="Attached databases"
                  addTitle="Attach database"
                  onAdd={() => setAttachOpen(true)}
                />

                {error ? (
                  <p className="mt-0.5 text-editor text-danger">Catalog error: {error}</p>
                ) : databases === null ? (
                  <p className="mt-0.5 text-editor text-gray-500 italic">Loading catalog…</p>
                ) : databases.length === 0 ? (
                  <p className="mt-0.5 text-editor text-gray-500 italic">No databases</p>
                ) : (
                  <ul className="list-none m-0 p-0 -mx-3">
                    {databases.map((db) => {
                      const dbKey = db.name;
                      const dbOpen = isOpen(dbKey);
                      return (
                        <li key={db.name}>
                          <TreeRow
                            depth={0}
                            expandable
                            open={dbOpen}
                            onToggle={() => toggleNode(dbKey)}
                            icon={<Database size={15} strokeWidth={2} className="text-gray-500" />}
                            label={db.name}
                            cursor={attach.has(db.name) ? "cursor-context-menu" : "cursor-pointer"}
                            title={attach.has(db.name) ? "Right-click (or ⋮) to detach" : undefined}
                            onClick={() => toggleNode(dbKey)}
                            onContextMenu={(e) => openDatabaseMenu(e, db.name)}
                            onMenu={attach.has(db.name) ? (e) => openDatabaseMenu(e, db.name) : undefined}
                          />
                          {dbOpen && (
                            <ul className="list-none m-0 p-0">
                              {db.schemas.map((schema) => {
                                const scKey = `${db.name}›${schema.name}`;
                                const scOpen = isOpen(scKey);
                                const hasTables = schema.tables.length > 0;
                                return (
                                  <li key={schema.name}>
                                    <TreeRow
                                      depth={1}
                                      expandable={hasTables}
                                      open={scOpen}
                                      onToggle={() => toggleNode(scKey)}
                                      icon={<Workflow size={15} strokeWidth={2} className="text-gray-500" />}
                                      label={schema.name}
                                      cursor={hasTables ? "cursor-pointer" : "cursor-default"}
                                      onClick={() => hasTables && toggleNode(scKey)}
                                    />
                                    {scOpen && hasTables && (
                                      <ul className="list-none m-0 p-0">
                                        {schema.tables.map((t) => {
                                          const geo = t.geomColumns.length > 0;
                                          const tKey = `${db.name}›${schema.name}›${t.name}`;
                                          return (
                                            <li key={t.name}>
                                              <TreeRow
                                                depth={2}
                                                expandable={false}
                                                icon={
                                                  <Table2
                                                    size={15}
                                                    strokeWidth={2}
                                                    className={geo ? "text-accent" : "text-gray-500"}
                                                  />
                                                }
                                                label={t.name}
                                                selected={selectedTable === tKey}
                                                cursor={geo ? "cursor-context-menu" : "cursor-pointer"}
                                                title={geo ? "Right-click (or ⋮) to add to map" : undefined}
                                                onClick={() => setSelectedTable(tKey)}
                                                onContextMenu={(e) => {
                                                  setSelectedTable(tKey);
                                                  openTableMenu(e, db.name, schema.name, t);
                                                }}
                                                onMenu={
                                                  geo
                                                    ? (e) => {
                                                        setSelectedTable(tKey);
                                                        openTableMenu(e, db.name, schema.name, t);
                                                      }
                                                    : undefined
                                                }
                                              />
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
          </div>

          <div
            className="flex gap-0.5 shrink-0 border-t border-gray-200 mt-2 -mx-3 -mb-3 px-3"
            role="tablist"
            aria-label="Sidebar panels"
          >
            <SidebarTab active={tab === "layers"} onClick={() => setTab("layers")}>
              Layers
            </SidebarTab>
            <SidebarTab active={tab === "browser"} onClick={() => setTab("browser")}>
              Browser
            </SidebarTab>
            <span className="flex-1" />
            <button
              title="Collapse panel"
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className="self-center w-7 h-7 grid place-items-center rounded-md text-gray-500 cursor-pointer hover:bg-gray-100 hover:text-gray-900"
            >
              <PanelLeft size={16} strokeWidth={2} />
            </button>
          </div>
        </aside>
        )}

        <main className="flex-1 min-w-0 flex flex-col">
          <Dock />
        </main>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}

      {overtureOpen && (
        <OvertureModal onClose={() => setOvertureOpen(false)} onLoad={loadOverture} />
      )}

      {attachOpen && (
        <AttachModal onClose={() => setAttachOpen(false)} onAttached={refreshCatalog} />
      )}
    </div>
  );
}

// A DuckDB-style sidebar section header: 12px medium gray-600 label with an
// optional trailing "+" icon button (Attach database / Add layer).
function SectionHeader({
  label,
  addTitle,
  onAdd,
}: {
  label: string;
  addTitle: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-gray-600 text-sm font-medium mb-1.5">
      <span>{label}</span>
      <Button variant="icon" title={addTitle} onClick={onAdd}>
        <Plus size={16} strokeWidth={2} />
      </Button>
    </div>
  );
}

// One row in the Browser catalog tree (database / schema / table). Flat and
// square in the DuckDB style: full-bleed hover fill, a disclosure chevron (or a
// spacer for leaves), a type icon, and a truncating label. `depth` drives the
// indent; `selected` keeps a persistent highlight (matches DuckDB's selected
// tree row). When `onMenu` is set the row carries a trailing kebab that opens
// the same actions menu as right-click — so the actions are reachable on touch
// devices, which have no context-menu gesture.
function TreeRow({
  depth,
  expandable,
  open,
  onToggle,
  icon,
  label,
  selected = false,
  cursor = "cursor-default",
  title,
  onClick,
  onContextMenu,
  onMenu,
}: {
  depth: number;
  expandable: boolean;
  open?: boolean;
  onToggle?: () => void;
  icon: ReactNode;
  label: string;
  selected?: boolean;
  cursor?: string;
  title?: string;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1.5 h-7 pr-1 text-editor select-none hover:bg-gray-100 ${cursor} ${
        selected ? "bg-gray-100" : ""
      }`}
      style={{ paddingLeft: 12 + depth * 14 }}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {expandable ? (
        <button
          className="w-4 h-4 grid place-items-center shrink-0 text-gray-500 cursor-pointer hover:text-gray-900"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        >
          {open ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="w-4 h-4 shrink-0 grid place-items-center">{icon}</span>
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      {onMenu && (
        <button
          className="w-6 h-6 grid place-items-center shrink-0 rounded text-gray-400 cursor-pointer hover:bg-white hover:text-gray-900"
          title="Actions"
          aria-label={`Actions for ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e);
          }}
        >
          <EllipsisVertical size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// Sidebar panel switcher tab (Layers / Browser), QGIS-style: an indigo top
// border marks the active panel, mirroring the Layer Properties tab strip.
function SidebarTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`text-sm font-medium border-t-2 -mt-px py-2 px-2.5 cursor-pointer hover:text-gray-900 ${
        active ? "text-gray-900 border-accent" : "text-gray-500 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

// Icon button shown on the collapsed rail (T-030): clicking expands the sidebar
// and brings that panel forward. An indigo left border marks the active panel,
// echoing the expanded tab strip.
function RailTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`w-7 h-7 grid place-items-center rounded-md border-l-2 cursor-pointer hover:bg-gray-100 hover:text-gray-900 ${
        active ? "text-gray-900 border-accent" : "text-gray-500 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}
