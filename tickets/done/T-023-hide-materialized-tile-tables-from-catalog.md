---
id: T-023
title: Keep materialised tile tables out of the Browser catalog tree
status: done
priority: P2
area: frontend
depends_on: [T-021]
branch: t-002-sidebar-tabs
resolution: obviated by T-024
---

## Goal

Adding a layer should not leave visible junk in the Browser panel. Today, the
per-layer tile-materialisation tables created by [[T-021]] show up in the
catalog tree as their own addable geometry layers — the user sees
`L_demo__main__cities__geom_tiles` next to `cities` and can "add" a tiles table
to the map. "Done" means those backing artifacts never appear in the Browser
tree (nor as addable layers), while the render path still finds them.

## Context

<context>
Introduced by [[T-021]]. `frontend/src/lib/layers.ts` `add()` calls
`prepareTileLayer` (`frontend/src/lib/tiles.ts`), which does
`CREATE OR REPLACE TABLE main.<id>_tiles AS … geom_3857 …` + an R-tree index in
the default (served) database. Because that table has a `geom_3857` column of
`data_type = 'GEOMETRY'`, the [[T-001]] detection query in
`frontend/src/lib/catalog.ts` flags it as a geometry-bearing table on the next
catalog reload, so it renders in the Browser tree with the ◈ marker and a
working "Add to map" menu.

Observed during T-021 verification: the demo db (4 geometry tables) showed **5**
geometry tables after a prior add, the extra being a leftover
`L_demo__main__pts__geom_tiles`.

Notes / candidate approaches:
  - The catalog filters at the **database** level (`WHERE NOT d.internal`), which
    already hides `temp`/`system`. `CREATE TEMP TABLE` would land the tiles in
    the connection-local `temp` catalog → auto-hidden and auto-cleaned. **Risk:**
    temp tables are connection-scoped; confirm the SQL-over-HTTP client
    (`@duckdb/ui-client` singleton, `frontend/src/lib/duckdb.ts`) keeps one
    stable server-side connection across the separate `query()` calls the tile
    protocol makes — otherwise the tile fetches won't see the table. This is why
    T-021 did not just switch to TEMP.
  - Alternatively materialise into a dedicated schema/db that the catalog query
    explicitly excludes (avoid name-matching on `_tiles`, which the project
    rejected for detection in T-001 — but an internal *location* is fine).
  - Whatever the fix, keep `layers.remove()`'s `DROP TABLE` cleanup working.
</context>

## Acceptance criteria

- [ ] After adding one or more layers, the materialised tile tables do not
      appear in the Browser catalog tree (nor as "Add to map" targets), even
      after a catalog reload.
- [ ] The tile render path still resolves the materialised table (layers keep
      rendering) and `layers.remove()` still cleans it up.
- [ ] Works for a source table in an attached database too.
- [ ] Frontend build/lint passes.

## Progress log

<!-- Append newest at the bottom. -->
- 2026-07-10: Filed from a [[T-021]] verification finding (materialised
  `<id>_tiles` tables leak into the Browser tree as addable geometry layers).
  Not started.
- 2026-07-10: **Obviated by [[T-024]]** — closed without a dedicated fix. T-024
  rewired the add-layer path off the ST_AsMVT tile path onto the Arrow/deck
  overlay, so `layers.add()` no longer materialises any `<id>_tiles` table. With
  no materialised artifact there is nothing for the catalog to leak, which erases
  the pollution at the source (the outcome this ticket wanted). Note: a dev DB
  that ran the old T-021 path may still hold stale `_tiles` tables from before
  the rewire; those are pre-existing data, not something the code creates now, and
  clear on a fresh instance.
