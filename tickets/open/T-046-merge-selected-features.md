---
id: T-046
title: Merge selected features into one (dissolve/union)
status: open
priority: P2
area: frontend
depends_on: [T-038]
branch:
---

## Goal

While editing a layer, a user selects two or more features of the same geometry
family and **merges** them into a single feature. For polygons this dissolves the
boundary between them (union); for lines it combines them into one multi-part
geometry. "Done" means: pick several features, hit Merge, they collapse into one
feature in the working set, and Save writes the merged geometry back through the
existing T-038 path.

## Context

<context>
Part of making the feature-editing toolbar feature-rich (user request,
2026-07-20). Built on T-038's editing mode. Per the project vision, geometry
operations are **native DuckDB spatial SQL** (CLAUDE.md "Vision") — do the union
in DuckDB, not in JS. Note T-004 already shipped a *layer-level* geoprocessing
"merge" tool (`tickets/done/T-004-...`, `lib/geoprocessing.ts` if present); this
is different — a **feature-level** merge inside the digitizing working set.

Shape:
- Selected features live in the Terra Draw working set (`editing.ts`,
  `selectedIds` set, `editing.ts:116`; snapshot filtered by `isWorkingFeature`,
  `editing.ts:103`). Merge acts on the current selection (`selectedCount`,
  `editing.ts:342`); require ≥2 selected.
- Collect the selected geometries as GeoJSON and round-trip through DuckDB:
  `ST_Union_Agg` over the geometries (or `ST_Union` pairwise) →
  `ST_AsGeoJSON(result)`. Reuse the `query` / `sqlLit` helpers
  (`lib/duckdb.ts`, imported at `editing.ts:44`) and the
  `ST_GeomFromGeoJSON('<sqlLit(...)>')` construction already used in `commit()`
  (`editing.ts:404-409`). **Watch the known DuckDB spatial geometry-aggregate WKB
  bug** — combining geometry aggregates can throw a spurious "little-endian WKB"
  error; if `ST_Union_Agg` trips it, fall back to per-row/pairwise `ST_Union`.
- Replace the selected features in the working set with the single merged feature:
  remove them (`draw.removeFeatures`, cf. `deleteSelected` at `editing.ts:334`)
  and add the merged one (`draw.addFeatures`, cf. `beginEdit` at `editing.ts:298`).
  Preserve `__rid` bookkeeping so Save's diff is correct: the merged feature keeps
  one source `rowid` (UPDATE that row), and the other merged rows must end up in
  `loadedRids` without a surviving feature so `commit()` DELETEs them
  (`editing.ts:412-414`). Confirm this against the commit diff logic.
- Merge only same-family features (enforced already by one-family-per-layer). A
  polygon union that yields a MultiPolygon is fine; ensure the layer/render path
  tolerates multi-part geometry.
- Toolbar: add a Merge button to `DrawToolbarView.tsx` (`:229`), enabled when
  `selectedCount >= 2`. Icon from Claude Design — **out of scope**; placeholder
  glyph following `DrawToolbarView.tsx:45-114`. Keep the design-system story in
  sync (`design-system/src/stories/DrawToolbar.stories.tsx`).

Related tickets to coordinate: T-042 (batched commit) touches the same
`commit()` diff logic; T-045 (rotate/scale) shares the selection plumbing.
</context>

## Acceptance criteria

- [ ] A Merge tool is enabled only when ≥2 features are selected in Select mode.
- [ ] Merging replaces the selected features with a single unioned/combined
      feature in the working set, computed via DuckDB spatial SQL.
- [ ] Save persists correctly: the merged geometry is written and the consumed
      source rows are deleted (no orphan rows, no duplicate).
- [ ] Merge is restricted to one geometry family; multi-part results render.
- [ ] The DuckDB geometry-aggregate WKB bug is handled (fallback path) if hit.
- [ ] `pnpm --dir frontend typecheck` + `build` pass; verified in the preview
      (merge two polygons, Save, confirm one row of merged geometry in the table).

## Progress log

- 2026-07-20: Implemented. `editing.mergeSelected()` collects the selected
  working-set geometries into a DuckDB `VALUES` set and unions them —
  `ST_Union_Agg` for polygons, `ST_Collect(list(g))` for lines/points — then
  `ST_AsGeoJSON` back. Verified the exact query against the bundled spatial
  (polygon union → Polygon, lines → MultiLineString; `ST_Union_Agg` did NOT trip
  the WKB aggregate bug here, so no fallback was needed). Working-set bookkeeping:
  the merged feature keeps the first selected `__rid` (Save UPDATEs it); the other
  consumed rows stay in `loadedRids` with no surviving feature so `commit()`
  DELETEs them. Toolbar Merge button enabled at `selectedCount>=2`. Frontend
  tsc+build pass; interactive merge+Save round-trip to be eyeballed in preview.
- 2026-07-20: Filed from user request (feature-rich editing toolbar). Feature-level
  merge (distinct from T-004's layer-level merge), done as native DuckDB
  `ST_Union`/`ST_Union_Agg`. Flagged the geometry-aggregate WKB bug and the
  `__rid`/`loadedRids` commit-diff bookkeeping as the two things to get right.
</content>
</invoke>
