---
id: T-024
title: Render added layers through the Arrow/deck overlay and stack them
status: done
priority: P1
area: frontend
depends_on: [T-021]
branch: t-002-sidebar-tabs
---

## Goal

Adding a catalog table to the map should render through the same Arrow/deck
GeoArrow overlay the SQL editor's Run preview uses — not the ST_AsMVT tile path.
Benchmarking showed Arrow is dramatically faster for these table sizes and over
high-latency links, and dropping the per-layer materialise step erases the
`<id>_tiles` catalog-pollution problem ([[T-023]]) entirely. The deck overlay,
which held a single result, is extended to **stack** several persistent layers
so multiple added tables draw at once.

## Context

<context>
Before this change `frontend/src/lib/layers.ts` `add()` went through the tile
path: `prepareTileLayer` materialised `main.<id>_tiles` (3857 + R-tree) then
`addTileLayer` registered a MapLibre vector source. That materialise step left
GEOMETRY-bearing `_tiles` tables in the catalog ([[T-023]]).

`frontend/src/lib/deckRender.ts` already had a half-built seam for this: the
`GeomSpec.staticLayer` field was declared (non-selection-coupled, not pickable
layer builder for persistent added layers) but never populated, and the overlay
only ever held one `rendered` result. This ticket completes that seam.

The tile path (`tiles.ts`) is kept — still reachable via the dev seam
`window.gisTiles` — as the future option for very large layers; only the
add-layer path is rewired.
</context>

## Acceptance criteria

- [x] `layers.add()` renders through the Arrow/deck overlay; no `_tiles` table
      is created (so [[T-023]] is obviated).
- [x] Multiple added layers stack on the map at once, each with a distinct
      palette; removing one leaves the others intact.
- [x] `layers.remove()` drops the layer from the overlay (no DROP TABLE needed).
- [x] The SQL editor Run preview still renders and its selection/highlight still
      works, composed over the persistent layers.
- [x] Frontend build/lint passes.

## Progress log

<!-- Append newest at the bottom. -->
- 2026-07-10: Started. Rewiring `layers.ts` off `tiles.ts` onto new
  `addDeckLayer`/`removeDeckLayer` in `deckRender.ts`; extending the overlay to
  compose a registry of static persistent layers plus the editor preview.
- 2026-07-10: Done and verified.
  - **deckRender.ts** — the overlay now holds a `Map<id, AddedLayer>` registry of
    persistent layers (Arrow table + geometry spec + palette) *plus* the editor's
    Run preview (`rendered`). A single `syncOverlay()` composes them (added layers
    bottom in insertion order → newest on top; preview last, pickable/highlighted)
    and is the only place layers reach the overlay. Completed the pre-existing
    `GeomSpec.staticLayer` seam: `POINT_STATIC`/`PATH_STATIC`/`POLYGON_STATIC`
    (non-pickable, no selection accessors) coloured from a cycling `PALETTES` list
    (monotonic tick, so removing one layer never recolours the others). New public
    API: `addDeckLayer(id, sql)` (probe → encode → register → sync, returns
    count+bounds), `removeDeckLayer(id)`, `setDeckLayerVisible(id, v)`. Fixed
    `clearDeck()` and the selection subscriber to re-sync (they previously called
    `setProps({layers:[]})` / rebuilt only the preview, which would have wiped the
    persistent layers).
  - **layers.ts** — `add()` now builds `SELECT "geom" AS geom FROM "db"."schema"."table"`
    and calls `addDeckLayer`, framing on the returned bounds; `remove()` calls
    `removeDeckLayer`. Dropped `prepareTileLayer`/`addTileLayer`/`tilesTable`/the
    `DROP TABLE` cleanup and the `query` import. No materialised copy → no `_tiles`
    tables (obviates [[T-023]]). `tiles.ts` is untouched and still reachable via the
    `window.gisTiles` dev seam.
  - **Verified** end-to-end: `pnpm typecheck` + `pnpm build` clean. Drove the
    running UI (Playwright, 5173): seeded point/line/polygon tables, right-click →
    Add to map for all three → three Layers rows all reach `ready`, map renders the
    stack (indigo points, emerald line, pink polygon) framed on the extent, zero
    console errors; removing the middle layer leaves the other two intact.
