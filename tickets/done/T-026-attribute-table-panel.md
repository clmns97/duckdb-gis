---
id: T-026
title: Attribute table panel — open a layer's rows as a dock tab
status: done
priority: P2
area: frontend
depends_on: [T-005]
branch: t-025-draw-edit-geometry
---

## Goal

QGIS's "Open Attribute Table": right-click an active layer in the Layers panel →
**Open attribute table** → a paged, scrollable grid of that layer's rows and
columns opens as a **dock tab** in the workspace (T-005), sitting alongside the
SQL Editor and Map tabs. The user can keep several attribute tables open as tabs,
tab between them and the map, and dock/float them like any other panel. Done means
a spatial layer's non-geometry attributes are browsable in a real grid without
writing SQL.

## Context

<context>
Depends on the dock shell from **T-005** (`frontend/src/components/Dock.tsx`,
`components/panels/`). This ticket registers a new dock panel component
(e.g. `attributes`) and opens one panel per layer, keyed by the layer id.

Data + reuse:
- Active layers live in `frontend/src/lib/layers.ts` (`layers.list()`,
  `ActiveLayer`, subscribe via `useSyncExternalStore` — same pattern as
  `SelectionChip`). Each attribute-table panel is keyed by `ActiveLayer.id`.
- `loadLayerInfo(layer)` (`lib/layers.ts`) already resolves a catalog-table
  layer's columns + types via `duckdb_columns()` — reuse it for the grid header.
- Row data: query through `query()` (`lib/duckdb.ts`); for a catalog-table layer
  use `layer.source` (`qualified(...)`), `SELECT * EXCLUDE (<geom>) ... LIMIT/OFFSET`
  for paging. Query-backed layers (Overture / SQL editor, `source` absent) — decide
  whether to support (re-run their SQL) or show "not available" for v1.
- The Layers panel context menu is opened from `App.tsx` (`openTableMenu`) and the
  Layers panel component (`components/LayersPanel.tsx`); add an "Open attribute
  table" item that adds/reveals the panel via the dock api.
- Selection integration is a nice-to-have: clicking a row could drive
  `lib/selection.ts` (map ↔ table highlight), like QGIS. Optional for v1.

Open design points (note in Progress log):
  - Paging vs. virtualized scroll for large tables (start with LIMIT/OFFSET paging).
  - How the dock api is reached from the Layers panel (expose the `DockviewApi`
    from `Dock.tsx` via a small store/context, mirroring `mapBus`).
</context>

## Acceptance criteria

- [x] Right-click an active layer → "Open attribute table" opens a dock tab with
      that layer's columns as headers and its rows in a scrollable/paged grid.
- [x] Opening the same layer twice reveals the existing tab (no duplicates).
- [x] Works as a first-class dock panel (tab/drag/float/close like Map & Editor).
- [x] Geometry column excluded from the grid; large tables stay responsive (paging).
- [x] Frontend build + typecheck pass; grid reads correctly against `tokens.css`.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-13: Split out of T-005 (which delivers only the dock shell + SQL editor).
  Not started.
- 2026-07-14: Implemented. New `lib/dockBus.ts` (mirrors `mapBus`) holds the
  `DockviewApi`, registered in `Dock.onReady` via `setDockApi`; `openAttributes
  (layer)` adds a panel `attr-<id>` or reveals the existing one (no duplicates).
  Registered an `attributes` component in `Dock.tsx` → new
  `components/panels/AttributesPanel.tsx`: a paged grid (LIMIT/OFFSET, PAGE_SIZE
  100, Prev/Next + "showing a–b of N") reading columns/total via the existing
  `loadLayerInfo` and rows via `query()` with `SELECT * EXCLUDE (<geom>) FROM
  <qualified>` — the layer's geometry column is dropped; `qualified`/`ident` are
  now exported from `layers.ts` for the SQL. **Decision:** query-backed layers
  (Overture / SQL result — no `source`) show a short "not available" note rather
  than re-running arbitrary SQL; the "Open attribute table" menu item is disabled
  for them. Sticky header, tokens-consistent styling under `dockview-theme-light`.
  Selection ↔ row highlight left as a future nice-to-have. `pnpm build` + `tsc`
  pass.
