---
id: T-028
title: "Design: in-memory working database + DuckDB-file projects (RFC)"
status: open
priority: P1
area: frontend
depends_on: []
branch:
---

## Goal

Decide and document the core data-model architecture for a duckdb-gis session.
Direction (settled in discussion — see Progress log): a session runs against an
**in-memory working database**, attached databases/files are **read-only
sources**, and edits (draw/edit geometry, geoprocessing output, SQL-created
tables) stay temporary in memory until the user explicitly **Saves the
project** — which materializes the working set into a **`.duckdb` file** that can
be re-opened later to restore everything (layers, styling, camera). The Layers
panel reflects the in-memory working set; the Browser tab is the read-only
catalog of sources. This is the **design/RFC ticket**: the deliverable is the
written decision + phased plan + risk spikes; the project-file *implementation*
is split into [[T-032]].

## Context

<context>
**How it works today (verified in the extension).** The extension does not open
a database of its own — it binds to whatever `DatabaseInstance` the DuckDB
process already opened (`src/http_server.cpp:62`, `UpdateDatabaseInstance
(context_db)`); all frontend SQL runs against that one in-process instance over
HTTP (`frontend/src/lib/duckdb.ts`). So behaviour is set by how DuckDB launched:
  - `duckdb -ui` (no file) → DuckDB's default **in-memory** database (catalog
    `memory`; hardcoded as the default result catalog at `http_server.cpp:572`).
    **We are already `:memory:` and ephemeral on the normal launch path.**
  - `duckdb file.db -ui` → `file.db` is the default, writable, persisted catalog.
  - `ATTACH` (`frontend/src/lib/attach.ts`) adds read-write catalogs by default.
So the proposal doesn't need to "become `:memory:`" — it mostly is. What it adds
is the **discipline**: sources are read-only, edits live in the working catalog,
write-out is explicit. Today no such rule exists (an edit could write into an
attached file).

**Peer precedent — GeoLibre** (opengeos, ~June 2026; React + MapLibre + deck.gl,
but **DuckDB-WASM** in-browser vs. our native in-process extension). It's almost
exactly this model: in-memory DuckDB session, "every vector layer with in-memory
features is exposed as a table" in its SQL Workspace (== "Layers panel = the
working DB"), ephemeral by default, remote sources are read-only streams (HTTP
range requests, `s3://`→HTTPS), and persistence is **explicit** — a
`.geolibre.json` project (layers + camera) or export to GeoJSON/GeoParquet/GPKG/
Shapefile/CSV; edits get undo/redo but aren't saved unless you save. Refs:
https://github.com/opengeos/GeoLibre ,
https://github.com/opengeos/GeoLibre/blob/main/README.md ,
https://gishub.org/blog/geolibre/

**How this differs for us (native, not WASM).** We have a real in-process
DuckDB: full extension ecosystem, native perf, larger datasets, spill-to-disk —
the whole point of the fork. So we should adopt the *model* but not inherit
WASM's constraints; in particular, prefer lazy layers over copy-everything.

**What this reconciles.** A single working-DB + project-file model unifies the
scattered "temporary" notions: draw/edit working set ([[T-025]]), SQL Run result
as a temp layer ([[T-027]]), query-backed Overture layers ([[T-012]]), and the
attach tickets ([[T-007]]/[[T-008]]/[[T-009]], which today attach writable
catalogs and would be recast as read-only sources).
</context>

## Decisions (from discussion — the RFC's starting position)

1. **Working DB = in-memory.** Launch with nothing attached → work in `memory`.
   We're already here; the work is treating attached DBs/files/remote as
   **read-only sources**, never writing to them implicitly.
2. **Project file = a plain `.duckdb` file. No new/branded extension** (user
   decision: everything is `.duckdb`). A "project" is just a `.duckdb` that
   contains our reserved metadata schema; a plain attach is one that doesn't.
3. **Save Project** = materialize the working DB into a `.duckdb` file, using
   DuckDB's whole-database copy primitive, plus write the metadata schema:
   `ATTACH 'proj.duckdb' AS proj; COPY FROM DATABASE memory TO proj;` then write
   `_gis.*`; `DETACH proj`.
4. **Reserved metadata schema `_gis`** in the project file (this is our format —
   detail lives in [[T-032]]): `_gis.project` (name, **schema_version**, map
   center/zoom/bearing/pitch, basemap, timestamps), `_gis.layers` (id, name,
   `source_kind` table|query, SQL for query-backed, geom column, **z-order**
   (feeds [[T-031]]), visible), `_gis.style` (per-layer symbology — [[T-010]]'s
   `LayerStyle` as native `JSON`). Styling storage is feasible and cheap.
5. **Open Project** = detect the `_gis` schema in an attached `.duckdb`, copy its
   data **back into memory** (`COPY FROM DATABASE proj TO memory; USE memory`),
   and restore layers/styling/camera. Recommended over working-in-file so
   "memory is *always* the working DB" stays one consistent mental model; a
   checkpoint/autosave-to-file can come later if the open-time copy cost bites.
6. **Lazy-materialize, don't copy-everything.** Layers stay query-backed/lazy by
   default; a layer is materialized into the working catalog only when it becomes
   **editable** (drawn on / edited / explicit "make editable" → scratch layer).
   Keeps RAM sane on large layers (Overture buildings). QGIS memory-layer model.
7. **Save = export/project first, not in-place write-back to sources.** Start
   with the project file + "Export layer as…" (GeoParquet/GPKG/GeoJSON/…). In-
   place write-back to a *writable* attached `.duckdb` is a later opt-in.
8. **Embed vs. reference at save time.** Default: materialize working/edited
   layers into the file; store pure-external layers (live Postgres/S3 view) as
   attach string + SQL references; offer "embed a snapshot" per layer explicitly.

## Open questions still to resolve in the RFC

- When launched as `duckdb existing.db -ui`, do we force a separate in-memory
  working catalog (`ATTACH ':memory:' AS working; USE working`) and demote the
  file to a read-only source? (Leaning yes — consistent model — but it's a real
  behavioural change; the file is today the writable workspace.)
- Schema-version migration strategy for `_gis` across app versions.
- Reference-layer staleness / missing-source handling on reopen.

## Acceptance criteria

- [ ] RFC written capturing the decisions above + resolutions to the open
      questions, as the durable design record.
- [ ] Each existing "temporary" ticket ([[T-025]], [[T-027]], [[T-012]],
      [[T-007]]/[[T-008]]/[[T-009]]) is annotated "fits as-is" or "needs change X"
      under this model.
- [ ] Risky assumptions prototyped in `spike/` and findings recorded:
      `COPY FROM DATABASE memory TO <file>` round-trip; forcing a `:memory:`
      working catalog when launched with an on-disk DB; open-time copy cost.
- [ ] Phased implementation plan + follow-up sub-tickets filed (project-file
      Save/Open is [[T-032]]; read-only-sources enforcement + lazy-materialize
      may be their own tickets).
- [ ] No production behaviour change required by *this* ticket (design only).

## Progress log

- 2026-07-14: Ticket created from user feedback — `:memory:` working DB, read-only
  sources, explicit write-back; Layers panel = working DB, Browser = sources.
- 2026-07-14: **Discussion resolved the direction** (this update). Confirmed via
  the extension code that we're already `:memory:` by default (bind-to-context-db,
  no forced open). Compared against **GeoLibre** (same model, DuckDB-WASM). Landed
  the decisions in the new "Decisions" section: project file = plain **`.duckdb`**
  (user: no new extension), Save via `COPY FROM DATABASE memory`, reserved `_gis`
  metadata schema (project/layers/style incl. z-order + JSON styling), Open =
  copy back to memory, lazy-materialize, export-first over in-place write-back.
  Implementation of the project file split into [[T-032]]. Next: write the RFC
  doc + the `spike/` round-trip prototype, then annotate the dependent tickets.
