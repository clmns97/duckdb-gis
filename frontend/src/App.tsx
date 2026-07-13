import { useEffect, useState } from "react";
import "./App.css";
import { MapView } from "./components/MapView";
import { SelectionChip } from "./components/SelectionChip";
import { EditorPanel } from "./components/EditorPanel";
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
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="mark" aria-hidden="true" />
        <b className="wordmark">duckdb-gis</b>
        <span className="spacer" />
        <button className="ghost">Help</button>
      </header>

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-body">
          {tab === "layers" ? (
            <section className="tree-section">
              <div className="section-head">
                <span>Layers</span>
                <button className="mini" title="Add layer">
                  +
                </button>
              </div>
              <LayersPanel />
            </section>
          ) : (
            <>
              <button
                className="overture-node"
                title="Add Overture Maps data (QuickOSM-style)"
                onClick={() => setOvertureOpen(true)}
              >
                <span className="tbl-icon" aria-hidden="true">
                  ◈
                </span>
                <span>Overture Maps</span>
                <span className="node-hint">quick load…</span>
              </button>

              <div className="search">
                <svg viewBox="0 0 16 16" className="icon" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <input type="text" placeholder="Search" spellCheck={false} />
              </div>

              <section className="tree-section">
                <div className="section-head">
                  <span>Attached databases</span>
                  <button
                    className="mini"
                    title="Attach database"
                    onClick={() => setAttachOpen(true)}
                  >
                    +
                  </button>
                </div>

                {error ? (
                  <p className="empty err">Catalog error: {error}</p>
                ) : databases === null ? (
                  <p className="empty">Loading catalog…</p>
                ) : databases.length === 0 ? (
                  <p className="empty">No databases</p>
                ) : (
                  <ul className="tree">
                    {databases.map((db) => (
                      <li key={db.name}>
                        <div
                          className={`node${attach.has(db.name) ? " attached" : ""}`}
                          title={attach.has(db.name) ? "Right-click to detach" : undefined}
                          onContextMenu={(e) => openDatabaseMenu(e, db.name)}
                        >
                          <span className="twisty">▾</span>
                          <span className="db-dot" aria-hidden="true" />
                          <span>{db.name}</span>
                        </div>
                        <ul>
                          {db.schemas.map((schema) => (
                            <li key={schema.name}>
                              <div className="node indent">
                                <span className="sch-icon">▤</span>
                                <span>{schema.name}</span>
                              </div>
                              {schema.tables.length > 0 && (
                                <ul>
                                  {schema.tables.map((t) => {
                                    const geo = t.geomColumns.length > 0;
                                    return (
                                      <li
                                        key={t.name}
                                        className={`node indent-2${geo ? " geo" : ""}`}
                                        title={geo ? "Right-click to add to map" : undefined}
                                        onContextMenu={(e) => openTableMenu(e, db.name, schema.name, t)}
                                      >
                                        <span className="tbl-icon">{geo ? "◈" : "▦"}</span>
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

          <div className="tabs" role="tablist" aria-label="Sidebar panels">
            <button
              role="tab"
              aria-selected={tab === "layers"}
              className={`tab${tab === "layers" ? " active" : ""}`}
              onClick={() => setTab("layers")}
            >
              Layers
            </button>
            <button
              role="tab"
              aria-selected={tab === "browser"}
              className={`tab${tab === "browser" ? " active" : ""}`}
              onClick={() => setTab("browser")}
            >
              Browser
            </button>
          </div>
        </aside>

        <main className="canvas">
          <div className="map-wrap">
            <MapView />
            <SelectionChip />
          </div>
          <EditorPanel />
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
