---
id: T-034
title: Align sidebar, layer rows & attribute table with the DuckDB UI
status: in-progress
priority: P2
area: frontend
depends_on: [T-026, T-030, T-031]
branch: t-034-duckdb-ui-alignment
---

## Goal

The Layers panel, Browser panel, and attribute table read as natural siblings of
the real DuckDB UI: flat and square (no rounded rows), a single gray-100 hover
fill, one indigo accent used sparingly, Lucide icons + `123 / # / T / △` data-type
glyphs, and a results-grid-style attribute table (type-glyph headers, hairline
grid, numeric columns right-aligned, row-number gutter). The Browser tree nodes
actually collapse/expand.

## Context

<context>
We reverse-engineered the real DuckDB UI at the component level — see
`design-reference/COMPONENTS.md` (recipes) and `design-reference/artifacts/shots/`
(screenshots). Target aesthetic: **flat, square (border-radius 0 on rows/tree/
grid), Inter, 12px headers/grid, gray-100 `#f3f4f6` hover, indigo `#494ab9`
accent, Lucide icons + filled type glyphs, grid header `#fcfcfd`, hairline
`rgba(0,0,0,.1)`**.

Current state (diverges):
- Sidebar is a tabbed Layers/Browser switch + collapse-to-rail
  (`frontend/src/App.tsx`); rows are `rounded-md` with `gray-200` hover; icons are
  Unicode glyphs (`▤ ◈ ▾ …`); Browser tree chevrons are decorative (always
  expanded).
- Layers rows in `frontend/src/components/LayersPanel.tsx`: visibility is
  context-menu-only (no eye toggle); no selected highlight.
- Attribute table `frontend/src/components/panels/AttributesPanel.tsx`: plain
  `<table>`, indigo-tinted header (`bg-subtle #f0f4fd`), 13px, no type glyphs, no
  numeric alignment.

Decisions (confirmed): keep the tabbed sidebar (restyle only, no stacked
sections); add `lucide-react`; full results-grid parity for the attribute table.

Reusables: `layers` store already has `setVisible` (`lib/layers.ts:284`) and
returns column types via `loadLayerInfo` (`lib/layers.ts:335,374`). GEOMETRY
detection convention in `lib/catalog.ts:45`. Shared `Button`, `ContextMenu`.

Plan file: `~/.claude/plans/ok-now-refactor-our-eventual-moler.md`.
</context>

## Acceptance criteria

- [x] Tokens add `gray-100`, `grid-cell #fcfcfd`, `hairline`, `syntax-number`;
      hover fills use gray-100.
- [x] `lucide-react` added; UI glyphs replaced with Lucide; `TypeGlyph` renders
      `123 / # / T / △` etc. from DuckDB types.
- [x] Tree/list rows are flat & square with gray-100 hover; Browser db/schema
      nodes expand/collapse via working chevrons; selected node highlighted.
- [x] Layers rows have an eye/eye-off visibility toggle wired to
      `layers.setVisible`.
- [x] Attribute table: type-glyph headers, `#fcfcfd` header, hairline grid,
      numeric columns right-aligned, row-number gutter, flat paging toolbar.
- [x] `pnpm --dir frontend typecheck` and `build` pass; [ ] exercised in the preview.

## Progress log

- 2026-07-16: Ticket opened from approved plan. Branch `t-034-duckdb-ui-alignment`
  off the working branch (main is far behind at T-003; branching from main would
  strand the current UI). Starting Step 0 (foundation).
- 2026-07-16: Implementation complete across all target files. Added
  `lucide-react` + `TypeGlyph`/`columnTypes` helpers; restyled tokens (gray-100
  hover, grid-cell, hairline). Sidebar (`App.tsx`) now uses flat/square `TreeRow`
  with working chevron collapse (`collapsedNodes` set) + selected-table highlight,
  Lucide icons throughout; `LayersPanel` gained an eye/eye-off toggle wired to
  `layers.setVisible` and a selected-row highlight; `AttributesPanel` rewritten to
  results-grid parity (type-glyph headers, `#fcfcfd` header, hairline grid,
  numeric right-align, `#` gutter, flat chevron paging). `Button`/`ContextMenu`
  moved to Lucide + hairline borders. `pnpm typecheck` and `build` both clean.
  Remaining: runtime verification in the preview, then commit.
- 2026-07-16: Touch affordance — every catalog/layer action was right-click-only,
  so it was unreachable on the phone preview (no context-menu gesture). Added an
  always-visible ⋮ kebab (`EllipsisVertical`) to actionable rows that opens the
  same `ContextMenu` at the tap point: Browser spatial tables (Add to map),
  attached databases (Detach), Layers rows (full menu), and the pinned basemap
  row (Change basemap). Also folded "Remove layer" into the Layers menu so the
  kebab is a complete action set. Right-click still works on desktop; typecheck +
  build clean.
- 2026-07-16: Preview testing surfaced two issues. (1) The attribute table
  crashed with a Binder "SELECT list is empty after resolving * expressions" on a
  catalog table whose only column is the geometry — `SELECT * EXCLUDE (geom)`
  resolves to nothing. Fixed in `AttributesPanel`: page query now lists the known
  non-geom columns explicitly (waits for `columns` to resolve) and a geometry-only
  table shows a clear note instead of crashing. (2) Overture layers show no
  attributes/stats — root cause is the loader fetching geometry only, a data-model
  gap beyond this ticket. Spun off as T-035 (with a geom-only-vs-all-columns
  benchmark) to load Overture attributes lazily.
