# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), versioned
independently of DuckDB (see "Versioning" in the README).

Before 1.0, a minor release may break things. Changes to the SQL surface (the
functions under "SQL functions" below) are always called out under
**Breaking**. The release procedure is in [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

## [0.1.0] - 2026-10-30

The first release under this project's own version line. The repository began
as a fork of [`duckdb/duckdb-ui`](https://github.com/duckdb/duckdb-ui); its
inherited `v1.4.4` tag is upstream's, not ours.

### SQL functions

| Function | |
|---|---|
| `start_gis()` | Start the server and open the UI in a browser |
| `start_gis_server(port := …)` | Start the server without opening a browser |
| `stop_gis_server()` | Stop the server |
| `get_gis_url()` | The UI's local URL |
| `gis_is_started()` | Whether the server is running |

The port defaults to `4214`; the `port` parameter or the `GIS_LOCAL_PORT`
environment variable change it. The extension does not register `start_ui()`,
so it loads alongside DuckDB's core `ui` extension.

### Added

- **Extension:** built on DuckDB's stable C extension API, so one binary works
  on DuckDB 1.4 LTS through 2.0. Serves a map frontend compiled into the binary
  from a localhost-only HTTP server; query results reach the browser as Arrow.
  The UI's background reads run on a small pool of connections so a slow query
  doesn't block them.
- **Platforms:** Linux (x86-64, arm64), macOS (Apple silicon; Intel on a
  best-effort basis), Windows (x86-64, MSVC and MinGW). Not DuckDB-Wasm.
- **Map:** MapLibre with deck.gl/GeoArrow rendering. Basemaps: an offline
  Natural Earth default, plus OpenFreeMap styles.
- **Layers panel:** add tables and query results as layers; reorder, show/hide,
  style (symbology), zoom to, inspect properties, open the attribute table.
- **Browser panel:** walk the catalog, attach other DuckDB database files
  (read-only except during an edit session), add geometry tables to the map.
- **SQL editor:** run spatial SQL and see the result as a temporary layer.
- **CRS handling:** geometry with a declared CRS is reprojected to WGS84 for
  display; coordinates that can't be lon/lat are refused with an explanation.
- **Overture Maps quick-load:** Overture themes as vector tiles, and "Create
  Layer from Selection" to copy selected features into an editable table.
- **Selection:** per-layer selection on the active layer, by click, Shift+click
  or a select mode (tap to toggle, drag a box) that works on touch screens.
  Select by expression and Select by location.
- **Processing:** tools that read a layer (optionally only its selected
  features) and write a new layer, all as DuckDB spatial SQL.
  - Vector geometry: Buffer, Centroids, Convex hull, Concave hull, Bounding
    box, Simplify, Dissolve, Multipart to single parts, Fix geometries, Add
    geometry attributes, Reproject, Voronoi polygons.
  - Vector overlay: Clip, Difference, Intersection, Union, Join attributes by
    location, Count points in polygon, Merge vector layers.
- **Editing:** draw points, lines and polygons; edit vertices, move, rotate,
  scale, merge, duplicate and delete features; undo/redo; write the edits back
  to the source table, including tables in attached databases.
- **Projects:** save and open a project as a plain `.duckdb` file (layers,
  styles, camera and working tables); a warning before unsaved work is
  discarded.

[Unreleased]: https://github.com/clmns97/duckdb-gis/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/clmns97/duckdb-gis/releases/tag/v0.1.0
