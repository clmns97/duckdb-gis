# ADR-0001 — Keep an in-memory working database, treat sources as read-only, persist projects explicitly

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-07 |
| **Tracked by** | #29 (RFC), #33 (project-file implementation) |

## Context

A duckdb-gis session accumulates state from several unrelated directions: drawn
and edited geometry, geoprocessing output, tables created from the SQL editor,
query-backed and tiled layers. Until now each of these had its own private
notion of "temporary", and nothing said where that state was allowed to live or
when it was allowed to touch disk.

**What is already true**, verified in the extension:

- The extension does not open a database of its own. It binds to whatever
  `DatabaseInstance` the DuckDB process already opened
  (`src/http_server.cpp`, `UpdateDatabaseInstance(context_db)`), and all
  frontend SQL runs against that one in-process instance over HTTP
  (`frontend/src/lib/duckdb.ts`). Behaviour is therefore decided by how DuckDB
  was launched:
  - `duckdb -ui` with no file → DuckDB's default **in-memory** database, catalog
    `memory`, which is also the hardcoded default result catalog. **The normal
    launch path is already in-memory and ephemeral.**
  - `duckdb file.db -ui` → `file.db` is the default, writable, persisted catalog.
- `ATTACH` (`frontend/src/lib/attach.ts`) adds catalogs **read-write** by
  default.

So the gap is not technical capability — it is that no rule exists. Today
nothing prevents an edit from being written into a user's attached production
database, and that is the risk this decision closes.

**Prior art.** GeoLibre (opengeos, ~June 2026) arrived at essentially this model
independently: an in-memory DuckDB session, every in-memory vector layer exposed
as a table, remote sources as read-only streams, ephemeral by default, with
persistence explicit via a project file or an export. It runs on DuckDB-WASM
rather than a native in-process DuckDB, so it reaches the model from a position
of much tighter constraints — which makes the convergence more interesting, not
less.

## Decision

A session runs against an **in-memory working database**. Attached databases and
files are **read-only sources**. Everything the user creates — drawn geometry,
geoprocessing output, SQL-created tables — stays in the working database until
they explicitly **save the project**, which materialises the working set into a
`.duckdb` file that can be reopened to restore layers, styling and camera.

The two sidebar panels map onto this split directly: the **Layers panel**
reflects the in-memory working set, the **Browser panel** is the read-only
catalog of sources.

We adopt the *model* GeoLibre uses but not its constraints. Because our DuckDB
is native and in-process we prefer **lazy, query-backed layers over copying
everything into memory** — copy-everything is a WASM concession we don't have to
inherit.

## Consequences

**Good.**

- A user can attach a production database without fear that a stray edit
  rewrites it. This is the main point.
- One rule replaces four ad-hoc notions of "temporary" — the draw/edit working
  set (#26), the SQL Run preview layer (#28), query-backed Overture layers (#13),
  and the attach tickets (#8, #9, #10).
- Ephemeral-by-default matches what the normal launch path already does, so the
  common case needs no new machinery.
- Save/Open becomes one well-defined operation with a single artifact, rather
  than per-feature export paths.

**Bad.**

- Working state is **lost on crash or accidental close** unless saved. That is a
  real regression in safety versus writing straight to a file, accepted in
  exchange for source integrity. Mitigation is a follow-on concern, not solved
  here.
- Working-set size is bounded by memory, mitigated only partly by DuckDB's
  spill-to-disk. Lazy layers matter more because of this.
- `duckdb file.db -ui` is now ambiguous: the launch database is writable and
  default, which contradicts read-only sources. Forcing a `:memory:` working
  catalog in that case is **unresolved** and needs a spike.
- Read-only has to be *enforced*, not merely documented. Until it is, the
  guarantee is a convention, and conventions get violated.

**Follow-on work.**

- #33 — project file Save/Open.
- #66 — enforce read-only on attached sources (the enforcement gap noted above).
- #67 — warn before discarding unsaved working-database state.
- Annotate each existing "temporary" issue (#26, #28, #13, #8, #9, #10) as "fits
  as-is" or "needs change X" under this model.
- Spikes, in `spike/`: `COPY FROM DATABASE memory TO <file>` round-trip
  fidelity; forcing a `:memory:` working catalog when launched with an on-disk
  database; open-time copy cost.

## Alternatives considered

**Write directly to attached databases.** What happens today by default. Needs
no new concepts and never loses work, but lets a mapping tool mutate a source
the user only meant to look at. Rejected: the failure mode is silent, remote from
the action that caused it, and potentially destroys data we don't own.

**Persist the working set continuously to a scratch file.** Survives crashes and
keeps memory bounded. Rejected for now because it introduces scratch-file
lifecycle and cleanup, and blurs the line the user cares about — "have I saved?"
Worth revisiting specifically as crash-safety mitigation, since it addresses the
main cost above.

**Project file as JSON manifest plus data exports** (GeoLibre's `.geolibre.json`
route). Human-readable and diffable. Rejected because we can put layers, data
and styling in a single `.duckdb` file that DuckDB opens natively — splitting
manifest from data would invent a packaging problem we don't otherwise have.

## References

- `src/http_server.cpp` — `UpdateDatabaseInstance(context_db)`, default result catalog
- `frontend/src/lib/duckdb.ts`, `frontend/src/lib/attach.ts`, `frontend/src/lib/layers.ts`
- Issues #29 (this RFC), #33, #26, #28, #13, #8, #9, #10
- GeoLibre — https://github.com/opengeos/GeoLibre · https://gishub.org/blog/geolibre/
- Requirements: REQ-C-003, REQ-F-006, REQ-F-007 in [../requirements/register.md](../requirements/register.md)
