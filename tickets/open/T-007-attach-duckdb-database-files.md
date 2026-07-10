---
id: T-007
title: Attach additional DuckDB database files to the catalog
status: open
priority: P1
area: frontend
depends_on: []
branch:
---

## Goal

Let the user attach one or more external DuckDB database files so their
schemas/tables appear in the Browser catalog alongside the default database.
This is the foundation of the "Add data source" flow; other source types
(object storage, Postgres) reuse the same entry point.

## Context

<context>
Today the Browser panel has an "Attach database" `+` button that does nothing —
`frontend/src/App.tsx` ~line 82–86. The catalog is built by
`frontend/src/lib/catalog.ts::loadCatalog()` from `duckdb_databases()` /
`duckdb_schemas()` / `duckdb_tables()`, and it already filters on the database
`internal` flag — so any newly `ATTACH`ed DB shows up automatically on the next
`loadCatalog()`.

Mechanics: `ATTACH '<path>.duckdb' AS <alias> (READ_ONLY)` via the existing
`query()` path (`frontend/src/lib/duckdb.ts`). Then refresh the catalog. This
is native in-process DuckDB, so the path is a **server-side** path (the
extension process's filesystem), not a browser file. Decide how the user
supplies the path — a text input for a path is the simplest v1; a real file
picker would need a server-side browse endpoint (out of scope for v1, note it).

Open points (note choices in Progress log):
  - Read-only vs read-write attach (recommend read-only default, safer).
  - Alias handling / collision with existing database names.
  - Detach affordance and error surfacing (bad path, locked file).
</context>

## Acceptance criteria

- [ ] "Attach database" opens a way to specify a DuckDB file to attach.
- [ ] Attaching runs `ATTACH` and the new database + its schemas/tables appear
      in the Browser tree after a catalog refresh.
- [ ] Multiple databases can be attached simultaneously.
- [ ] Errors (missing file, bad path, name collision) surface readably.
- [ ] A way to detach exists (or is explicitly deferred and noted).
- [ ] Frontend build/lint passes.

## Progress log

- 2026-07-09: Ticket created. Not started. Shared "Add data source" entry point
  reused by [[T-008]] and [[T-009]]. Pairs with the Browser panel ([[T-002]]).
