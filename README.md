<p align="center">
  <img src="frontend/public/favicon.svg" width="112" alt="duckdb-gis logo: contour lines of a hill in purple on a dark disc">
</p>

<h1 align="center">duckdb-gis</h1>

<p align="center">
  <a href="https://github.com/clmns97/duckdb-gis/actions/workflows/MainDistributionPipeline.yml"><img src="https://github.com/clmns97/duckdb-gis/actions/workflows/MainDistributionPipeline.yml/badge.svg?branch=main" alt="Build"></a>
  <a href="https://github.com/clmns97/duckdb-gis/actions/workflows/Compatibility.yml"><img src="https://github.com/clmns97/duckdb-gis/actions/workflows/Compatibility.yml/badge.svg?branch=main" alt="DuckDB compatibility"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://duckdb.org"><img src="https://img.shields.io/badge/DuckDB-1.4%2B-7d66ff.svg" alt="DuckDB 1.4+"></a>
</p>

**A desktop-style GIS in your browser, with DuckDB as the engine.** `gis` is a
DuckDB extension: `CALL start_gis()` opens a map UI — layers, a catalog browser,
a SQL editor, selection, processing tools and editing — on the data in your
DuckDB session. It borrows [QGIS](https://qgis.org)'s concepts and vocabulary;
all the work runs as SQL with DuckDB's [`spatial`](https://duckdb.org/docs/stable/core_extensions/spatial/overview)
extension, in-process, on your machine.

![duckdb-gis: roads buffered by a processing tool, one buffer selected, and the points near the roads from a SQL query](docs/screenshot.png)

> **Status: pre-1.0.** v0.1.0 is the first release. Things work and are tested,
> but the UI and, in minor releases, the SQL functions may still change — see
> the [changelog](CHANGELOG.md).

## Quick start

> **Not yet listed.** The submission to
> [`duckdb/community-extensions`](https://github.com/duckdb/community-extensions)
> is still in progress, so `INSTALL gis FROM community` does not work yet.
> Until it lands, [build from source](#building-from-source).

```sql
INSTALL gis FROM community;
LOAD gis;
CALL start_gis();   -- starts a local server and opens the UI in your browser
```

Then give it something to show. Any table with a `GEOMETRY` column works:

```sql
INSTALL spatial;
LOAD spatial;

CREATE TABLE cities AS
  SELECT name, ST_Point(lon, lat) AS geom
  FROM (VALUES
    ('Berlin',    13.4050, 52.5200),
    ('Hamburg',    9.9937, 53.5511),
    ('Munich',    11.5820, 48.1351),
    ('Cologne',    6.9603, 50.9375),
    ('Frankfurt',  8.6821, 50.1109)
  ) t(name, lon, lat);

-- or read a file: ST_Read handles GeoJSON, GeoPackage, Shapefile, …
CREATE TABLE countries AS FROM ST_Read('countries.geojson');
```

In the UI, open the **Browser** panel, right-click the table and choose
**Add to map**. Or type a query into the **SQL editor** and run it: the result
is drawn as a temporary layer.

## Features

- **Map and layers** — add tables and query results as layers; reorder,
  show/hide, style, zoom to, inspect their properties, browse the attribute
  table. Basemaps: an offline Natural Earth map by default, OpenFreeMap styles
  online.
- **Browser** — walk the DuckDB catalog and attach other DuckDB database files
  (read-only unless you edit them).
- **SQL editor** — run spatial SQL; geometry results appear on the map.
- **Selection** — click, Shift+click, or turn on select mode to tap features or
  drag a box (works on touch screens). Select by expression (a SQL condition)
  and Select by location (against another layer). Each layer keeps its own
  selection; the gestures act on the active layer.
- **Processing** — tools that read a layer, or just its selected features, and
  write the result as a new layer:
  - geometry: Buffer, Centroids, Convex/Concave hull, Bounding box, Simplify,
    Dissolve, Multipart to single parts, Fix geometries, Add geometry
    attributes, Reproject, Voronoi polygons;
  - overlay: Clip, Difference, Intersection, Union, Join attributes by
    location, Count points in polygon, Merge vector layers.

  Distances and areas are in metres.
- **Editing** — draw points, lines and polygons; edit vertices; move, rotate,
  scale, merge, duplicate and delete features; undo/redo; save the edits back to
  the table, including tables in attached databases.
- **Coordinate systems** — geometry with a declared CRS is reprojected to WGS84
  for display; coordinates that can't be longitude/latitude are refused with an
  explanation rather than drawn in the wrong place.
- **Overture Maps** — load [Overture](https://overturemaps.org) themes
  (buildings, places, roads, …) as vector tiles, select features, and copy them
  into an editable table.
- **Projects** — save and open your layers, styles, map view and working tables
  as a single `.duckdb` file; a warning before unsaved work is discarded.

## Requirements

- **DuckDB 1.4 LTS or later**, in any client that loads extensions — the CLI,
  Python, R, Node, …. One binary covers every version from 1.4 on.
- **Platforms:** Linux (x86-64, arm64), macOS (Apple silicon), Windows
  (x86-64). Not DuckDB-Wasm: the extension runs an HTTP server.
- **A web browser** on the same machine.
- The UI installs and loads DuckDB's `spatial` extension on first start, which
  needs network access once.

## Functions

| Function | Returns | |
|---|---|---|
| `start_gis(port := 4214)` | message | Start the server and open the UI in your browser |
| `start_gis_server(port := 4214)` | message | Start the server without opening a browser |
| `stop_gis_server()` | message | Stop the server |
| `get_gis_url()` | URL | The UI's address |
| `gis_is_started()` | boolean | Whether the server is running |

All are table functions; use them with `CALL` or `FROM`. The port defaults to
`4214`; the `port` parameter or the `GIS_LOCAL_PORT` environment variable
change it.

The extension is named `gis`, not `ui`, so it loads alongside DuckDB's own
[UI extension](https://duckdb.org/docs/stable/core_extensions/ui). That also means the CLI's
`duckdb -ui` flag, which calls `start_ui()`, opens DuckDB's UI, not this one.
To make it open this one, add `.ui_command start_gis()` to your `~/.duckdbrc`.

## Security and privacy

- The server listens on **localhost only** and accepts SQL only from its own
  page (it checks the `Origin` header), so other websites can't use it.
- The UI runs **any SQL you type**, with the rights of the DuckDB process that
  loaded the extension — the same as typing it into DuckDB yourself. Don't load
  it into a process that holds data you wouldn't query directly.
- **Your data stays local.** The UI and the server make network requests only
  for things you ask for: online basemaps, Overture data, remote files you
  query, and installing `spatial`.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Building from source

The extension is built on DuckDB's stable
[C extension API](https://github.com/duckdb/extension-template-c), so the build
needs no DuckDB checkout — just CMake, a C/C++ compiler and Python 3:

```sh
git clone https://github.com/clmns97/duckdb-gis.git
cd duckdb-gis
make configure      # once: Python venv with duckdb and the test runner
make                # → build/release/gis.duckdb_extension
```

Load the result into any DuckDB 1.4+ with unsigned extensions allowed:

```sh
duckdb -unsigned -cmd "LOAD 'build/release/gis.duckdb_extension'; CALL start_gis();"
```

The built frontend (`frontend/dist/`) is committed and compiled into the
binary, so `make` never needs Node. After changing anything under
`frontend/src`, rebuild it first with `make frontend` (needs Node and pnpm);
CI fails if `frontend/dist` is stale.

## Development

### Tests

```sh
make test_release                             # SQL tests in test/sql (latest DuckDB)
make test_release DUCKDB_TEST_VERSION=1.4.5   # ...against another DuckDB
cd frontend && pnpm typecheck                 # frontend static checks
cd frontend && pnpm test:e2e                  # Playwright end-to-end suite
```

The end-to-end suite starts its own extension server over a demo database
(`testdata/`) and a Vite dev server; see [test/README.md](test/README.md).

### Frontend with hot reload

Run the Vite dev server, which proxies SQL to a running extension:

```sh
cd frontend && pnpm install && pnpm dev    # http://127.0.0.1:5173
```

```sql
-- in a DuckDB shell
LOAD 'build/release/gis.duckdb_extension';
CALL start_gis_server();   -- localhost:4214, where Vite proxies /ddb
```

### How it works

The extension starts an HTTP server that serves the frontend compiled into the
binary and runs SQL: `POST /ddb/run` executes the request body and streams the
last statement's result back as [Arrow IPC](https://arrow.apache.org/docs/format/Columnar.html#ipc-streaming-format)
(`src/http_server.cpp`, `src/query.cpp`). The frontend — React, MapLibre and
deck.gl — decodes the Arrow results and renders geometry with GeoArrow layers.
Everything spatial, from a buffer to a spatial join, is SQL sent to DuckDB.

Background reads (layer data, attribute pages) run on a small pool of
connections, so they don't wait behind a long query in the SQL editor.
Decisions behind the design are recorded in [docs/adr/](docs/adr/).

### Repository layout

| Path | |
|---|---|
| `src/` | The C++ extension: SQL functions, HTTP server, SQL → Arrow |
| `frontend/` | The map UI (React, Vite, MapLibre, deck.gl) |
| `design-system/` | Storybook UI kit for the frontend's components |
| `test/sql/` | SQL-level extension tests |
| `testdata/` | Deterministic demo database for manual and e2e testing |
| `scripts/` | Build helpers (frontend embedding, Natural Earth basemap) |
| `docs/` | Release procedure, architecture decisions, requirements |

## Contributing

Bug reports, ideas and pull requests are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Work is tracked in
[GitHub Issues](https://github.com/clmns97/duckdb-gis/issues); the current
focus is the [v0.1.0 milestone](https://github.com/clmns97/duckdb-gis/milestone/1).

## Versioning and releases

Releases are tagged `vMAJOR.MINOR.PATCH` and versioned independently of DuckDB:
a release supports the DuckDB versions its CI builds and tests against. Our own
releases start at `v0.1.0`; the inherited `v1.4.4` tag is upstream's. Changes
are listed in the [changelog](CHANGELOG.md), and the release procedure is in
[docs/RELEASING.md](docs/RELEASING.md).

## License and acknowledgements

MIT — see [LICENSE](LICENSE).

duckdb-gis began as a fork of [`duckdb/duckdb-ui`](https://github.com/duckdb/duckdb-ui)
and keeps its copyright notice (Stichting DuckDB Foundation). Since the move to
DuckDB's stable C API, the extension, its HTTP transport and the client have
been rewritten, and the project no longer tracks upstream.

Built with [DuckDB](https://duckdb.org) and its `spatial` extension,
[MapLibre GL JS](https://maplibre.org), [deck.gl](https://deck.gl) and
[GeoArrow](https://geoarrow.org), [Terra Draw](https://terradraw.io) and
[cpp-httplib](https://github.com/yhirose/cpp-httplib). The offline basemap is
made with [Natural Earth](https://www.naturalearthdata.com) (public domain);
online basemaps come from [OpenFreeMap](https://openfreemap.org) with
© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

DuckDB is a trademark of the DuckDB Foundation. This project is independent and
is not affiliated with, maintained by, or endorsed by the DuckDB Foundation or
DuckDB Labs.
