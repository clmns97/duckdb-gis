---
id: T-001
title: Detect usable map layers by GEOMETRY column type, across all databases
status: open
priority: P1
area: frontend
depends_on: []
branch:
---

## Goal

The layer browser should identify which catalog tables are *usable as map
layers* by detecting geometry **by column type**, up front — a table is a
candidate layer iff it has at least one column of `data_type = 'GEOMETRY'`.
Detection spans every attached database, not just the default one. The result
feeds the sidebar so the user can see and add real geometry-bearing layers.

## Context

<context>
Design decision (do it this way, not duckgl's way): detect layers by type via
`duckdb_columns()` filtered on `data_type = 'GEOMETRY'`, joined across
`duckdb_databases()`. This is strictly better than duckgl's name-matching
heuristic (looking for columns named `geom`/`geometry`/etc.):
  - catches geometry columns with **any** name,
  - **no false positives** from non-geometry columns that happen to be named
    like one,
  - works **across attached databases**, which duckgl cannot do at all.

This fits the existing catalog layer, which already queries
`duckdb_databases()` / `duckdb_schemas()` / `duckdb_tables()` and builds the
db › schema › table sidebar tree.

Where things live:
  - `frontend/src/lib/catalog.ts` — `loadCatalog()` runs the catalog queries
    and returns `CatalogDatabase[]` (`db.name` → `schemas[]` → `tables[]`).
    Add geometry detection here. Note the existing filtering convention:
    filter on the *database* `internal` flag only (schema `internal` is
    unreliable). `query` / `str` come from `./duckdb`.
  - `frontend/src/App.tsx` — consumes `loadCatalog()` (state `databases`,
    line ~13) and renders the sidebar. The "Attached databases" tree is at
    ~line 80–127; the "Layers" section (currently hardcoded "No layers yet",
    line ~70–78) is where detected geometry tables should surface as
    addable layers.

Detection query shape (join columns to databases, keep only geometry-bearing
tables):

    SELECT c.database_name AS db, c.schema_name AS schema,
           c.table_name AS name, c.column_name AS geom_column
    FROM duckdb_columns() c
    JOIN duckdb_databases() d ON d.database_name = c.database_name
    WHERE c.data_type = 'GEOMETRY' AND NOT d.internal
    ORDER BY 1, 2, 3;

A table can have more than one geometry column — decide whether a layer maps to
(table) or (table, column). Recommend (table, column) so multi-geometry tables
expose each as its own selectable layer, but confirm against how MapView /
deckRender consume a layer.
</context>

## Acceptance criteria

- [ ] `catalog.ts` detects geometry columns via `duckdb_columns()` where
      `data_type = 'GEOMETRY'`, joined across `duckdb_databases()` (not
      name-matching).
- [ ] Detection works for tables in **attached** databases, not only the
      default/in-memory one.
- [ ] Geometry columns are detected regardless of column name; non-geometry
      columns are never treated as layers (no false positives).
- [ ] The catalog result exposes, per table, which column(s) are geometry (so
      the UI can offer them as layers) — shape agreed with how a layer is
      consumed downstream (`MapView` / `deckRender`).
- [ ] Sidebar reflects usable layers (at minimum: the data is available to the
      "Layers" section; wiring the add-layer UI can be a follow-up if scoped
      out here — note it in the Progress log).
- [ ] Build passes (`make` for the extension is unaffected; run the frontend
      build/lint for the TS change).

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created from design note. Not started.
