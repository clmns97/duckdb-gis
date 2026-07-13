import { useEffect, useState } from "react";
import { Dock } from "./components/Dock";
import { Button } from "./components/Button";
import { LayersPanel } from "./components/LayersPanel";
import { OvertureModal } from "./components/OvertureModal";
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

  // Overture quick-load (T-012): resolve the chosen extent to a bbox, then add
  // one query-backed layer per selected theme. The S3 query itself is a
  // placeholder until the data path lands (see lib/overture); errors surface on
  // the layer row like any other failed layer.
  const loadOverture = async (req: OvertureRequest) => {
    setTab("layers");
    const bbox = req.extent === "selected" ? await selectionBbox() : viewportBbox();
    if (!bbox) return; // no map / empty selection — nothing to clip to
    // Bring up httpfs + anonymous S3 access on demand (T-008). If it fails the
    // read below still errors readably on the layer row, so don't block on it.
    await ensureOvertureAccess().catch(() => {});
    for (const themeId of req.themes) {
      const theme = OVERTURE_THEMES.find((t) => t.id === themeId);
      if (!theme) continue;
      const id = `L_ov_${req.release}_${theme.id}`.replace(/[^A-Za-z0-9]/g, "_");
      void layers.addQuery({
        id,
        name: `Overture ${theme.label}`,
        sql: buildOvertureQuery(theme, req.release, bbox),
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
        <Button variant="ghost">Help</Button>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-[300px] shrink-0 border-r border-gray-200 p-3 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px]">
          {tab === "layers" ? (
            <section>
              <div className="flex items-center justify-between text-gray-500 text-sm font-medium mb-1.5">
                <span>Layers</span>
                <Button variant="mini" title="Add layer">
                  +
                </Button>
              </div>
              <LayersPanel />
            </section>
          ) : (
            <>
              <button
                className="flex items-center gap-1.5 w-full mb-2 px-2 py-1.5 text-editor text-gray-900 text-left bg-subtle border border-gray-200 rounded-md cursor-pointer hover:border-primary-border-active hover:text-accent"
                title="Add Overture Maps data (QuickOSM-style)"
                onClick={() => setOvertureOpen(true)}
              >
                <span className="text-sm text-accent" aria-hidden="true">
                  ◈
                </span>
                <span>Overture Maps</span>
                <span className="ml-auto text-xs text-gray-500">quick load…</span>
              </button>

              <div className="flex items-center gap-2 text-gray-500">
                <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  spellCheck={false}
                  className="w-full border-0 outline-none text-gray-900 bg-transparent"
                />
              </div>

              <section>
                <div className="flex items-center justify-between text-gray-500 text-sm font-medium mb-1.5">
                  <span>Attached databases</span>
                  <Button
                    variant="mini"
                    title="Attach database"
                    onClick={() => setAttachOpen(true)}
                  >
                    +
                  </Button>
                </div>

                {error ? (
                  <p className="mt-0.5 text-editor text-danger">Catalog error: {error}</p>
                ) : databases === null ? (
                  <p className="mt-0.5 text-editor text-gray-500 italic">Loading catalog…</p>
                ) : databases.length === 0 ? (
                  <p className="mt-0.5 text-editor text-gray-500 italic">No databases</p>
                ) : (
                  <ul className="list-none m-0 p-0">
                    {databases.map((db) => (
                      <li key={db.name}>
                        <div
                          className={`flex items-center gap-1.5 px-1 py-[3px] rounded-md text-editor hover:bg-gray-200 ${
                            attach.has(db.name) ? "cursor-context-menu" : "cursor-default"
                          }`}
                          title={attach.has(db.name) ? "Right-click to detach" : undefined}
                          onContextMenu={(e) => openDatabaseMenu(e, db.name)}
                        >
                          <span className="text-[10px] text-gray-500 w-2.5">▾</span>
                          <span
                            className="w-3 h-3 rounded-[3px] border-[1.5px] border-gray-500"
                            aria-hidden="true"
                          />
                          <span>{db.name}</span>
                        </div>
                        <ul className="list-none m-0 p-0">
                          {db.schemas.map((schema) => (
                            <li key={schema.name}>
                              <div className="flex items-center gap-1.5 pl-[22px] pr-1 py-[3px] rounded-md text-editor hover:bg-gray-200 cursor-default">
                                <span className="text-gray-500 text-sm">▤</span>
                                <span>{schema.name}</span>
                              </div>
                              {schema.tables.length > 0 && (
                                <ul className="list-none m-0 p-0">
                                  {schema.tables.map((t) => {
                                    const geo = t.geomColumns.length > 0;
                                    return (
                                      <li
                                        key={t.name}
                                        className={`flex items-center gap-1.5 pl-10 pr-1 py-[3px] rounded-md text-editor hover:bg-gray-200 ${
                                          geo ? "cursor-context-menu" : "cursor-default"
                                        }`}
                                        title={geo ? "Right-click to add to map" : undefined}
                                        onContextMenu={(e) => openTableMenu(e, db.name, schema.name, t)}
                                      >
                                        <span className={`text-sm ${geo ? "text-accent" : "text-gray-500"}`}>
                                          {geo ? "◈" : "▦"}
                                        </span>
                                        <span>{t.name}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
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
          </div>
        </aside>

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

// Sidebar panel switcher tab (Layers / Browser), QGIS-style: an indigo top
// border marks the active panel, mirroring the Layer Properties tab strip.
function SidebarTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
