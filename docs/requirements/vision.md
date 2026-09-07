# Vision & scope

## The goal

**Replicate QGIS's core workflows in the browser, with DuckDB as the engine and
all compute local.**

QGIS is the reference for *what* the workflows are — Layers panel, Browser
panel, feature selection, digitizing, geoprocessing tools. DuckDB is the reason
to build it anyway: spatial SQL over the data where it already lives, no import
step, no server. "QGIS does it this way" is a legitimate argument in a design
discussion here.

The compute is **native and in-process**. The extension runs inside the DuckDB
instance that launched it, so there is no remote backend and no WASM sandbox —
the full extension ecosystem, native performance and spill-to-disk are all
available.

## Stakeholders

Requirements exist because somebody wants them. These are the roles that get to
put pressure on the design.

| Stakeholder | What they need | Consequence |
|---|---|---|
| **GIS practitioner** | Familiar QGIS-shaped workflows; their data on a map without an import step | Drives the functional requirements; QGIS is the usability benchmark |
| **Data engineer / analyst** | Spatial SQL against existing DuckDB, Parquet, S3 data; map as an inspection surface | Drives read-only sources and the SQL-first paths |
| **Maintainer** | Small reviewable surface; not to be trapped by decisions made in a hurry | Drives ADRs, and the bias toward fewer moving parts |
| **Outside contributor** | To see what's planned and pick something up without asking | Drives public Issues, this directory, `CONTRIBUTING.md` |
| **DuckDB community-extensions reviewers** | An extension that builds reproducibly and behaves itself | Drives the build/packaging constraints and the offline guarantee |
| **End user, security-conscious** | That a local tool stays local | Drives the offline guarantee as a hard constraint, not a preference |

## System boundary

Separating what we build from what we merely talk to — the distinction that
decides whether something can become a requirement at all.

**The system** (we build it, we're responsible for it):

- The `gis` DuckDB extension: `start_gis()`, the local HTTP server, settings and
  session state (`src/`).
- The MapLibre + deck.gl frontend: Layers panel, Browser panel, SQL editor,
  digitizing, selection, geoprocessing UI (`frontend/`).
- The layer model and the working-database / project-file semantics.

**The context** (we interact with it, we don't control it — it constrains us and
we must not assume it will change):

- DuckDB core and its `spatial` extension. Missing spatial functions are a real
  limit: issue #48 is blocked precisely because `ST_Split` doesn't exist.
- The browser, MapLibre GL and deck.gl.
- Data sources: attached DuckDB files, Parquet, object storage, Postgres.
- Remote tile and data providers: Overture's hosted PMTiles, basemap providers.
- The `duckdb/community-extensions` listing process and its build matrix.

**Out of scope** (deliberately, so it stops coming up):

- **Being a server.** No multi-user deployment, no auth, no hosted service. It
  is a local tool for one person with their own data.
- **Replacing QGIS.** Cartographic print layouts, the plugin ecosystem, the full
  processing toolbox. We take the core workflows, not the surface area.
- **Editing the sources.** Attached databases are read only; see
  [ADR-0001](../adr/0001-in-memory-working-database-and-project-files.md).
- **Being a general DuckDB UI.** That is upstream `duckdb/duckdb-ui`'s job, and
  `LOAD ui; LOAD gis;` coexist in one session.

## What "done" looks like for v0.1.0

Listed as a DuckDB community extension, installable with
`INSTALL gis FROM community;`, with the QGIS-shaped core loop working end to
end: browse a catalog → add a layer → select features → run spatial SQL →
digitize an edit → save a project.
