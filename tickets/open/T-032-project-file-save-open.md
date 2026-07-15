---
id: T-032
title: Project files — Save/Open a session as a .duckdb file
status: open
priority: P1
area: frontend
depends_on: [T-028]
branch:
---

## Goal

Let the user **Save the current session as a project** and **Open a saved
project** to pick up exactly where they left off. A project is a plain
**`.duckdb` file** (no new/branded extension — everything is `.duckdb`) that
contains both the working data (as tables) and a reserved metadata schema holding
layers, styling, layer z-order, and the map camera. Save materializes the
in-memory working database into the file; Open copies it back into memory and
restores the map — layers, symbology, and viewport all come back.

## Context

<context>
This implements the project-file half of the [[T-028]] architecture RFC — read
that first for the full model and the decisions this depends on. Key settled
points:
  - We already run against an in-memory `memory` catalog on the normal launch
    path (`duckdb -ui`); see the [[T-028]] context / `src/http_server.cpp:62`.
  - **Project file = plain `.duckdb`.** A project is a `.duckdb` that has our
    reserved `_gis` schema; a plain attached `.duckdb` ([[T-007]]) is one that
    doesn't — that's how Open distinguishes them.

**Save** (materialize working DB → file):
```sql
ATTACH 'my-project.duckdb' AS proj;
COPY FROM DATABASE memory TO proj;   -- all working tables in one statement
-- then write the _gis.* metadata schema (below) into proj
DETACH proj;
```

**Reserved `_gis` metadata schema** (we own this format; version it):
  - `_gis.project` — name, **schema_version**, map center/zoom/bearing/pitch,
    basemap, created/modified timestamps.
  - `_gis.layers` — layer id, display name, `source_kind` (`table` | `query`),
    SQL for query-backed layers, geom column, **z-order** (from [[T-031]]),
    visibility.
  - `_gis.style` — per-layer symbology: [[T-010]]'s `LayerStyle` serialized to a
    DuckDB native `JSON` column.

**Open** (file → working memory + restore UI):
```sql
ATTACH 'my-project.duckdb' AS proj;   -- detect _gis; if absent, it's a plain attach
COPY FROM DATABASE proj TO memory;
USE memory;
-- read _gis.* → rebuild the layers store + apply styles + restore camera
DETACH proj;
```
Then drive the existing stores: `frontend/src/lib/layers.ts` (rebuild
`ActiveLayer`s + z-order), `deckRender` styles ([[T-010]] `setDeckLayerStyle`),
and the map camera via `frontend/src/lib/mapBus.ts` / `MapView`.

**Where the UI hangs.** Add "Save project…" / "Open project…" entries (header
menu near the Help button in `frontend/src/App.tsx:171`, or a project menu).
File I/O runs server-side through the extension (the `.duckdb` path is on the
machine running DuckDB), so Save/Open go through the SQL-over-HTTP path
(`frontend/src/lib/duckdb.ts`), not a browser file picker — decide how the user
supplies the path (input field vs. a server-side file dialog) and note it.

**Scope guardrails (from [[T-028]]):** materialize working/edited layers into the
file; pure-external layers (live Postgres/S3 view) are saved as attach + SQL
references, not copied, unless the user picks "embed snapshot". In-place
write-back to a source is out of scope here.
</context>

## Acceptance criteria

- [ ] "Save project…" writes a `.duckdb` file containing the working tables
      (`COPY FROM DATABASE memory`) plus a populated `_gis` schema
      (project/layers/style with z-order + JSON styling).
- [ ] "Open project…" on that file restores the session: the same layers appear
      in the Layers panel in the same z-order, with the same symbology, and the
      map returns to the saved camera.
- [ ] Opening a `.duckdb` **without** a `_gis` schema still behaves as a plain
      attach ([[T-007]]) — the two paths are distinguished by schema detection.
- [ ] `_gis.project.schema_version` is written and checked on open (unknown/newer
      version surfaces a readable message rather than corrupting state).
- [ ] Query-backed layers ([[T-012]]) round-trip via stored SQL (or embedded
      snapshot if chosen); pure-external references are recorded, not copied.
- [ ] Save/Open path (how the user supplies the file path) is decided and noted.
- [ ] Frontend build + typecheck pass; a Save→Open round-trip verified end-to-end.

## Progress log

- 2026-07-14: Ticket created from the [[T-028]] discussion — implements
  project-file Save/Open. Format decided: plain `.duckdb` (no new extension) with
  a reserved `_gis` metadata schema; Save via `COPY FROM DATABASE memory`, Open
  copies back to memory and restores layers/styling/camera. Blocked on the
  [[T-028]] RFC locking the working-DB model (esp. the launched-with-a-file case
  and lazy-materialize rules).
