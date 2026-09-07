# Glossary

Words this project uses in a specific way. Several are overloaded — "layer" and
"project" mean different things in GIS, in DuckDB, and in software generally —
so the definitions here are the ones that apply in this repository.

Terms are grounded in the code; where a term has a direct representation, the
type or module is named.

---

**Attached database** — A DuckDB catalog added to the session with `ATTACH`
(`frontend/src/lib/attach.ts`), appearing in the Browser panel. Under
[ADR-0001](../adr/0001-in-memory-working-database-and-project-files.md) these
are **read-only sources**: the system reads from them but never writes edits
back. Contrast **working database**.

**Basemap** — The raster or vector backdrop beneath the layers (OSM, CARTO,
ESRI). Selected by the user; see `frontend/src/lib/basemaps.ts`. Basemap tiles
are fetched from the network, which is a user-initiated fetch and therefore
compatible with the **offline guarantee**.

**Browser panel** — The sidebar tab showing the read-only catalog of available
**sources** — databases, schemas, tables. The counterpart to the **Layers
panel**. Browsing something does not put it on the map; adding it does.

**Digitizing** — Creating and editing geometry by hand on the map: drawing
points, lines and polygons, moving vertices, splitting and merging features.
The digitizing toolbar appears only in **edit mode**. See
`frontend/src/lib/editing.ts`.

**Edit mode** — The state entered by editing an existing layer or starting a new
one. Outside edit mode the digitizing tools are hidden and map clicks mean
**selection** instead.

**Feature** — A single row carrying a geometry, plus its attributes. The GIS
word for what SQL would call a row of a spatial table.

**Geometry column** — A column of DuckDB `GEOMETRY` type. Layer detection is
**type-based**, not name-based: any table with a geometry column is a candidate
layer, in any attached database. This is deliberate and is a differentiator —
see [REQ-F-002](register.md).

**Layer** — A renderable dataset on the map, tracked in the **Layers panel**.
Represented by `ActiveLayer` in `frontend/src/lib/layers.ts`, discriminated by
`LayerKind`:

- `table` — a catalog table added directly.
- `query` — backed by a SQL query rather than a stored table.
- `preview` — the transient result of a SQL editor **Run**, id `L_sql_preview`.
- `pmtiles` — a tiled remote source such as Overture.

A layer is a *view onto* data plus presentation state (visibility, z-order,
styling); it is not a copy of the data.

**Layers panel** — The sidebar tab listing active layers in draw order, with
visibility toggles, styling and reordering. Reflects the **working database**.

**Offline guarantee** — The extension serves everything, frontend included, from
its own compiled binary and makes **no outbound network requests** of its own.
Fetching data the *user asked for* — a basemap, an Overture query — is a
different thing and is allowed. A change that adds a CDN fetch, telemetry or a
runtime download is rejected on principle. See
[REQ-C-001](register.md) and `CONTRIBUTING.md`.

**Project** — A saved session: the layers, their styling, and the camera,
persisted to a `.duckdb` file that can be reopened to restore the session. Note
this is *not* the repository or the GitHub Project board. See
[ADR-0001](../adr/0001-in-memory-working-database-and-project-files.md).

**Selection set** — The features currently selected on the map, and the input to
geoprocessing operations. See `frontend/src/lib/selection.ts`.

**Source** — Anything data is read *from*: an attached database file, object
storage, a folder of geo files, a remote tiled dataset. Read-only by design.

**Working database** — The in-memory DuckDB catalog (`memory`) holding the
session's editable state: drawn geometry, geoprocessing output, tables created
from the SQL editor. Ephemeral until the user saves a **project**. On the normal
`duckdb -ui` launch path this is simply DuckDB's default in-memory database.
