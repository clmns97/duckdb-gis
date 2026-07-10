import { useEffect, useState } from "react";
import "./App.css";
import { MapView } from "./components/MapView";
import { EditorPanel } from "./components/EditorPanel";
import { loadCatalog, type CatalogDatabase } from "./lib/catalog";
import { query } from "./lib/duckdb";
import { getMap } from "./lib/mapBus";
import { addTileLayer, removeTileLayer, prepareTileLayer } from "./lib/tiles";
import { renderGeoArrow, clearDeck } from "./lib/deckRender";

export function App() {
  const [databases, setDatabases] = useState<CatalogDatabase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <div className="search">
            <svg viewBox="0 0 16 16" className="icon" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <input type="text" placeholder="Search" spellCheck={false} />
          </div>

          <section className="tree-section">
            <div className="section-head">
              <span>Layers</span>
              <button className="mini" title="Add layer">
                +
              </button>
            </div>
            <p className="empty">No layers yet</p>
          </section>

          <section className="tree-section">
            <div className="section-head">
              <span>Attached databases</span>
              <button className="mini" title="Attach database">
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
                    <div className="node">
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
                              {schema.tables.map((t) => (
                                <li key={t} className="node indent-2">
                                  <span className="tbl-icon">▦</span>
                                  <span>{t}</span>
                                </li>
                              ))}
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
        </aside>

        <main className="canvas">
          <div className="map-wrap">
            <MapView />
          </div>
          <EditorPanel />
        </main>
      </div>
    </div>
  );
}
