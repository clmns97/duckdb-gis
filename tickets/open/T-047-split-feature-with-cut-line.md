---
id: T-047
title: Split a feature with a cut line
status: open
priority: P2
area: frontend
depends_on: [T-038]
branch:
---

## Goal

While editing a layer, a user selects a feature, draws a **cut line** across it,
and the feature is split into two (or more) features along that line — the QGIS
"Split Features" tool. "Done" means: activate Split, draw a line through a polygon
or line feature, and it becomes multiple separate features in the working set,
each persisted on Save through the existing T-038 write-back.

## Context

<context>
Part of making the feature-editing toolbar feature-rich (user request,
2026-07-20). Built on T-038's editing mode. Per the project vision, do the
geometry work in **native DuckDB spatial SQL** (CLAUDE.md "Vision").

Shape:
- Split is a two-step gesture: (1) pick the target feature (Select), (2) draw a
  scratch line that crosses it. The scratch line is *not* a feature of the layer —
  it's a transient cutting geometry. Consider a dedicated split sub-mode using a
  Terra Draw line draw that, on `finish`, runs the cut and discards the line
  rather than adding it to the working set (Terra Draw modes + `finish` event are
  wired at `editing.ts:207-218`).
- Compute the split in DuckDB: `ST_Split(target_geom, cut_line)` returns a
  geometry collection; expand it to individual geometries (e.g. `ST_Dump` /
  `UNNEST` then `ST_AsGeoJSON` each part). Verify these functions exist in the
  bundled DuckDB `spatial` version before committing to the approach; if `ST_Split`
  is unavailable, `ST_Difference`/`ST_Intersection` against a buffered/haldnf-plane
  split is the fallback. Reuse `query`/`sqlLit` (`lib/duckdb.ts`, imported at
  `editing.ts:44`) and the `ST_GeomFromGeoJSON('<sqlLit(...)>')` pattern from
  `commit()` (`editing.ts:404`).
- Working-set bookkeeping: replace the original feature with the split parts.
  One part keeps the original `__rid` (UPDATE on Save); the extra parts are new
  features with no `__rid` (INSERT). This is the inverse of the merge case
  (T-046) — get the `__rid` / `loadedRids` handling right against the commit diff
  (`editing.ts:399-414`).
- Only same-family output (splitting a polygon yields polygons, a line yields
  lines) — consistent with one-family-per-layer.
- Toolbar: add a Split tool to `DrawToolbarView.tsx` (`:229`), enabled when
  exactly one feature is selected. Icon from Claude Design — **out of scope**;
  placeholder glyph per `DrawToolbarView.tsx:45-114`. Keep the design-system
  story in sync (`design-system/src/stories/DrawToolbar.stories.tsx`).

Gotcha: the cut line must fully cross the feature to produce a clean split;
surface a readable message (existing `error` surface, `DrawToolbar.tsx:14`,
`DrawToolbarView.tsx:316`) when the split yields a single geometry (no cut).
</context>

## Acceptance criteria

- [ ] A Split tool lets the user select one feature, draw a cut line, and splits
      the feature into multiple features along the line.
- [ ] The cut line is transient — it is not committed as a feature of the layer.
- [ ] Split parts are computed via DuckDB spatial SQL; one part keeps the source
      `rowid`, the rest are inserted as new rows on Save.
- [ ] A non-crossing / no-op cut surfaces a clear message instead of corrupting
      the feature.
- [ ] Output stays within the layer's geometry family.
- [ ] `pnpm --dir frontend typecheck` + `build` pass; verified in the preview
      (split a polygon into two, Save, confirm two rows in the table).

## Progress log

- 2026-07-20: **Blocked on the bundled spatial extension.** Probed the DuckDB
  `spatial` shipped in `build/release`: **neither `ST_Split` nor `ST_Polygonize`
  exists** (only `ST_Node`, `ST_Difference`, `ST_Boundary`, `ST_Dump`,
  `ST_Union`, `ST_Collect`). The standard no-`ST_Split` recipe (node the polygon
  boundary with the cut line, then `ST_Polygonize`) is therefore unavailable too,
  and a hand-rolled half-plane construction is fragile (single straight cuts
  only) — not worth shipping. Options to unblock: (a) upgrade/rebuild the spatial
  extension to a version exposing `ST_Split`/`ST_Polygonize`; (b) implement a
  line-only split (tractable: cut a LineString at its intersection with the cut
  line via `ST_Node` + `ST_Dump`) and defer polygon split; (c) defer the whole
  ticket. Deferred pending that decision; the other four toolbar ops
  (T-045/046/048/049) shipped without it. No toolbar Split button added yet.
- 2026-07-20: Filed from user request (feature-rich editing toolbar). Native
  DuckDB `ST_Split` (verify availability). Two-step draw-a-cut-line gesture; cut
  line is transient. Inverse of T-046's `__rid`/`loadedRids` commit bookkeeping.
</content>
</invoke>
