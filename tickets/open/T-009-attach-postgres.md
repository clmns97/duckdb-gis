---
id: T-009
title: Attach Postgres databases as a data source (exploratory)
status: open
priority: P3
area: frontend
depends_on: [T-007]
branch:
---

## Goal

Let the user attach a PostgreSQL/PostGIS database so its tables appear in the
Browser catalog and can be queried/rendered — extending the "Add data source"
flow to live SQL databases. Marked exploratory ("maybe") — validate value/effort
before committing heavily.

## Context

<context>
Extends [[T-007]]'s "Add data source" entry point. DuckDB's `postgres`
extension supports `ATTACH 'dbname=... host=... user=...' AS pg (TYPE postgres)`;
tables then appear via the same catalog functions `loadCatalog()` already uses
(`frontend/src/lib/catalog.ts`), so much of the Browser wiring is shared with
T-007. Runs through `query()` (`frontend/src/lib/duckdb.ts`). The `postgres`
extension is not loaded today (see bootstrap in `frontend/src/App.tsx` ~line
22–24) — install/load on demand.

Open questions (this is why it's exploratory):
  - Connection UX + **credential security** (don't log the connection string).
  - PostGIS geometry: does it come back as DuckDB `GEOMETRY` for the layer
    detection in [[T-001]], or need conversion? Verify.
  - Performance / read-only expectations for remote Postgres.
</context>

## Acceptance criteria

- [ ] Feasibility confirmed (geometry round-trips, perf acceptable) — recorded.
- [ ] User can attach a Postgres DB; its tables appear in the Browser catalog.
- [ ] Geometry tables from Postgres are detectable as layers (works with
      [[T-001]]) or a conversion path is documented.
- [ ] Credentials handled without leaking; errors surface readably.
- [ ] Frontend build/lint passes.

## Progress log

- 2026-07-09: Ticket created as exploratory. Not started. Lowest priority of the
  data-source tickets; confirm value before deep work.
