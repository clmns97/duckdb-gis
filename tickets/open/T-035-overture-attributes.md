---
id: T-035
title: Load Overture layer attributes (browsable + summarizable), lazily
status: open
priority: P2
area: frontend
depends_on: [T-012, T-026, T-034]
branch:
---

## Goal

An Overture quick-load layer carries its feature attributes, not just geometry:
opening its attribute table shows the real columns (road `class`/`names`, place
`categories`, etc.) and Layer Properties shows feature count + geometry type.
The map still appears fast — geometry renders first and attributes load lazily in
the background / on demand, so a heavy theme doesn't block the first paint.

## Context

<context>
Today Overture layers are geometry-only by construction. `buildOvertureQuery`
(`frontend/src/lib/overture.ts:113-122`) projects **only** `geometry::GEOMETRY AS
geom`, and `App.loadOverture` (`frontend/src/App.tsx:189-209`) materializes that
into a TEMP table (`CREATE TEMP TABLE L_ov_… AS <that query>`) then adds a
query-backed layer via `layers.addQuery` whose render SQL is `SELECT geom FROM
L_ov_…`. Because the layer has no `source` (`ActiveLayer.source`,
`lib/layers.ts:45-52`), two things are empty:
- `loadLayerInfo` (`lib/layers.ts:362-398`) early-returns nulls for
  query-backed layers → Layer Properties shows no columns/count/geom-type.
- The attribute table menu item is disabled when `!layer.source`
  (`LayersPanel.tsx` `openLayerMenu`), and `AttributesPanel` only pages a
  catalog `source`.

So this is a data-model gap, not a rendering bug. Discovered during T-034 when a
user opened the attribute table for an Overture layer and saw nothing. (The
separate geometry-only *catalog* table crash — `SELECT * EXCLUDE (geom)` on a
table with no other columns — was fixed in T-034: `AttributesPanel` now selects
the known non-geom columns explicitly and shows a "geometry only" note.)

### Benchmark (why lazy loading — measured, not guessed)

Ran against the live Overture bucket, central-Berlin extent (~5×4 km), anonymous
S3 secret + `enable_object_cache=true` (mirrors `lib/remote.ts`). Materialized
geom-only vs all-columns via `COPY … TO parquet`; parquet size ≈ network payload.

| theme (rows × cols)        | geom-only (warm) | all-cols (warm) | payload geom → all |
|----------------------------|------------------|-----------------|--------------------|
| transportation (20402×23)  | 3.1 s            | 13.3 s          | 1.56 → 5.83 MB (3.7×) |
| places (25891×19)          | ~3 s             | 4.0 s           | 0.35 → 4.56 MB (13×)  |

Cold (first hit on a theme, object-cache miss): geom-only was 14 s (places) to
69 s (transportation) — dominated by S3 file-listing + row-group footer pruning
across the whole-planet glob, independent of column count.

**Conclusions:**
1. Attributes are NOT negligible: they add several seconds warm and multiply the
   payload 3.7–13×. Blocking the first map paint on them noticeably hurts.
2. Cold-start (footer listing/pruning) dominates and is column-independent —
   the object cache already amortizes it across queries.
3. → Fetch geometry first (fast paint), then attributes lazily.

### Decision: background prefetch (chosen)

Fetch attributes automatically in the background once the geometry layer is
ready, rather than waiting for the user to open the attribute table. Rationale:
the cold cost (S3 glob listing + footer pruning) is paid by the geometry read and
cached, so the follow-up attribute read is "warm" — it skips the listing and only
downloads the attribute column pages (~10 s transportation, ~1 s places from the
table above), and that happens off the critical path with the map already
interactive. So attributes are usually ready by the time the user looks; the UI
only needs a loading state for the window where a prefetch is still in flight.

Sequencing (confirms the mental model): **geometry read = cold** (does the
listing/pruning, paints the map) → **attribute read = warm** (footers cached, just
the extra column bytes). "Warm" ≠ free: the object cache holds metadata, not data
pages, so the attribute pass re-downloads the surviving row groups' attribute
columns once — the deliberate price of painting geometry first instead of
blocking on a single all-columns read.

### Implementation sketch (not binding)

- Give query-backed layers an optional browse relation + attribute state, e.g.
  `ActiveLayer.browse = { relation: string; geomColumn: string }` and an
  `attrStatus: "idle" | "loading" | "ready" | "error"` set by `addQuery`.
  Overture passes the temp-table name (`L_ov_…`) + `"geom"`.
- In `addQuery`, after the geometry layer reaches `ready` (map painted), kick off
  the background attribute read: materialize the attribute columns into a sibling
  temp table (keep the geom-only render table untouched so the already-rendered
  deck layer isn't disturbed) —
  `CREATE OR REPLACE TEMP TABLE L_ov_…__attr AS SELECT <attrs>, geometry::GEOMETRY
  AS geom FROM read_parquet(...) WHERE <same bbox>`. Flip `attrStatus` and emit.
  A caller-supplied `prefetch?: () => Promise<void>` (mirroring the existing
  `prepare?`) keeps `addQuery` generic and lets `App.loadOverture` own the SQL.
- Point `loadLayerInfo` and `AttributesPanel` at `layer.browse` when there's no
  catalog `source`; if `attrStatus === "loading"`, show a spinner and resolve when
  it flips to `ready` (await the in-flight prefetch — don't start a second read).
- Decide the attribute column set: bringing `SELECT *` is simplest and the
  payloads above are only a few MB; a curated subset per theme is a later tweak.
- Gotcha: geom-then-attributes re-scans the surviving row groups (object cache
  holds footers, not data pages) — that's the ~10 s attribute delta above, paid
  once in the background and then cached.

Plan file (T-034 origin): `~/.claude/plans/ok-now-refactor-our-eventual-moler.md`.
</context>

## Acceptance criteria

- [ ] Opening an Overture layer's attribute table shows its real attribute
      columns with type glyphs (not the "query-backed, not browsable" note).
- [ ] Layer Properties for an Overture layer shows feature count + geometry type
      (+ columns), like a catalog layer.
- [ ] Geometry still paints first; attributes prefetch in the background once the
      layer is ready, with a loading state for the in-flight window — the first
      map paint is not blocked on the attribute fetch.
- [ ] Attributes are materialized once and reused (no re-fetch per page).
- [ ] `pnpm --dir frontend typecheck` and `build` pass; exercised in the preview
      on a transportation + a places layer.

## Progress log

- 2026-07-16: Opened from a T-034 finding. Root cause: Overture loader fetches
  geometry only. Benchmarked geom-only vs all-columns (table above) — attributes
  add 3.7–13× payload / several seconds warm, cold-start is column-independent →
  lazy (on-demand, materialize-once) is the right shape. Next: pick on-demand vs
  background prefetch and wire a `browse` relation for query-backed layers.
- 2026-07-16: Decided **background prefetch** — cold geometry read caches the S3
  listing/footers, so the follow-up attribute read is warm and runs off the
  critical path once the map is painted (~10 s transportation / ~1 s places,
  hidden). See the Decision section. Next: wire `browse` + `attrStatus` on
  query-backed layers and a background attribute materialize in `addQuery`.
- 2026-07-16: Trade-off to revisit (do NOT decide yet). Overture's DuckDB docs
  recommend a single query selecting geometry + the attribute columns you want,
  not a two-pass fetch. Cold load is footer-dominated and column-independent
  (see T-036), so fetching attributes in the same cold query adds little cold
  time; the two-pass prefetch's first-paint win is mainly on WARM loads. If T-036
  cuts the cold-start, prefer the simpler single-pass "select geom + attrs" and
  drop the background-prefetch machinery. Revisit after T-036's findings.
