---
id: T-012
title: Overture Maps quick-load (QuickOSM-style) in the catalog
status: in-progress
priority: P2
area: frontend
depends_on: [T-008]
branch: t-002-sidebar-tabs
---

## Goal

A quick way to pull Overture Maps data into the map from the catalog — the
Overture equivalent of QGIS's **QuickOSM / Overpass Turbo**. The user picks:
which **feature types/themes** they want, which **release** (latest
preselected), and an **extent** to clip to (current viewport, the extent of a
selected feature, or a named place — city/region/country). We lean on the
existing Overture tooling rather than reimplementing the hard parts.

## Context

<context>
UX reference: QuickOSM / Overpass Turbo, but for Overture. The user reports a
**community extension exists for Overture** — first task is to **identify and
verify it** (exact DuckDB community extension name and capabilities). If what
actually exists is the documented "query Overture GeoParquet on S3 directly"
pattern (`read_parquet('s3://overturemaps-.../release/<ver>/theme=.../*')`
with `spatial` + `httpfs`), use that. Either way this builds on the S3 +
GeoParquet plumbing from [[T-008]] (httpfs, `read_parquet`). Runs via the
native `query()` path (`frontend/src/lib/duckdb.ts`).

Overture themes/types to expose in the picker: places, buildings,
transportation (segments/connectors), addresses, base (land/water/etc.),
divisions. Releases are date-versioned (e.g. `2024-xx-xx.x`) — fetch/list
available releases and **preselect the latest**.

Extent options (drives a bbox filter on the query, e.g. an `ST_Intersects` /
bbox predicate):
  - **Current viewport** — read the MapLibre map bounds (`MapView`,
    `frontend/src/components/MapView.tsx`).
  - **Extent of a selected feature** — needs the selection set from [[T-003]].
  - **Named place (city/region/country)** — needs a place→bbox lookup (see
    stretch below).

### Stretch / research: geocoding place extents via Overture divisions
The user asked whether we can get the "named place extent" **from Overture
itself** instead of Nominatim/Overpass. Plausible for coarse extents: Overture's
**divisions** theme contains named division areas (country/region/county/
locality) with geometries — so "Berlin" → division_area → its bbox is
feasible for city/region/country selection (not full street-address geocoding).
Prototype this in `spike/` before committing. If it doesn't pan out, fall back
to an external geocoder, but keep that out of this ticket's core scope.

This is a large feature — expect to split into sub-tickets once the extension
question is settled (e.g. "release/theme picker + query builder", "extent
selection", "divisions geocoding spike").
</context>

## Acceptance criteria

- [ ] The Overture data source (community extension vs. direct GeoParquet-on-S3)
      is identified and verified; approach recorded.
- [ ] User can pick theme(s)/feature type(s), a release (latest preselected),
      and an extent, then load the result onto the map.
- [ ] Extent supports at least current viewport and a selected feature's extent
      ([[T-003]]); named-place extent delivered or explicitly deferred.
- [ ] Loading is bbox-clipped so it doesn't pull whole-planet data.
- [ ] Errors (extension/httpfs missing, bad release, empty result) surface
      readably.
- [ ] Frontend build/lint passes.

## Progress log

- 2026-07-09: Ticket created (umbrella). Not started. Depends on S3/GeoParquet
  plumbing ([[T-008]]); "selected feature extent" needs [[T-003]]. Open: exact
  Overture community extension; Overture-divisions geocoding is a spike.
- 2026-07-10: **UI shell built** (entry point + form; the data path stays with
  [[T-008]]). Decision: a persistent "Overture Maps" node atop the Browser tree
  opens a modal form — rejected the inline-menu idea because the inputs
  (theme multi-select + release + extent) are form-shaped, not menu-shaped.
  - `frontend/src/lib/overture.ts` — theme catalog, static release list
    (latest-first), extent resolution (`viewportBbox` from MapLibre bounds,
    `selectionBbox` from the [[T-003]] selection set), and `buildOvertureQuery`
    — a **clearly-marked PLACEHOLDER** emitting the documented GeoParquet-on-S3
    read + bbox-overlap predicate. Release path / partition layout / geom+bbox
    columns are UNVERIFIED pending the ticket's step-one research.
  - `OvertureModal.tsx` — the form (themes, release=latest, extent). Viewport
    extent works; selected-feature extent enabled only when a selection exists;
    named-place is present but disabled ("coming soon", deferred per AC).
  - `lib/layers.ts` — added `addQuery({id,name,sql})` for query-backed (non-
    catalog) layers; `ActiveLayer.source` now optional. Each selected theme
    loads as its own layer via the normal Arrow/deck path; failures (e.g. httpfs
    missing) surface on the layer row like any other error.
  - `App.tsx` — Browser node + modal wiring + `loadOverture` orchestration.
  - Frontend typecheck / lint / build all pass.
  - **Next (blocked on [[T-008]]):** verify the Overture source (community ext
    vs. direct S3), replace the placeholder query + wire httpfs, fetch the live
    release list. Then split off sub-tickets: per-type refinement, and the
    divisions-geocoding spike for named-place extent.
- 2026-07-10: **Data path now live — Overture loads for real.** Source question
  settled: **direct GeoParquet-on-S3, no community extension needed.** Verified
  against the live bucket (see [[T-008]] for the httpfs/anonymous-secret plumbing
  in `lib/remote.ts`):
  - Partition layout `theme=<t>/type=<ty>/` confirmed; each row carries a native
    `geometry` (GEOMETRY crs84) + `bbox` struct(xmin,xmax,ymin,ymax). The
    shell's `buildOvertureQuery` (geometry→geom, bbox-overlap predicate) was
    already **correct** — only the release list was wrong.
  - Fixed `OVERTURE_RELEASES` to real values (`2026-06-17.0`, `2026-05-20.0`);
    dropped the "PLACEHOLDER/unverified" caveats. `loadOverture` now calls
    `ensureOvertureAccess()` before adding layers; failures surface on the layer
    row. Full render SQL (probe + `st_asgeoarrowpoint`) verified on real data.
  - Frontend typecheck / lint / build pass.
  - **Perf caveat:** small themes (places) load interactively; buildings /
    transportation over a viewport are minutes (whole-planet file glob). Fine
    for now; a large-extent mitigation is a follow-up.
  - **Follow-ups:** live release listing + auto-latest; per-type picker
    refinement; named-place extent (divisions geocoding spike); not-yet
    runtime-driven in the browser (SQL path verified in `duckdb` directly).
- 2026-07-10: **Community `overture` extension evaluated** (`cubilica/duckdb-
  overture`, v0.1.0, single maintainer; installs+loads in our binary). Verdict:
  **do NOT adopt as the core loader; keep direct `read_parquet`.** Findings:
    - It's a convenience/normalization layer *on top of* the same S3 read — it
      still needs `spatial`+`httpfs`+`SET s3_region`, so it does not replace the
      [[T-008]] plumbing.
    - Reader macros (`read_overture_places/buildings/roads/addresses(west,east,
      south,north)`) return opinionated flattened schemas — `read_overture_
      places` gives `id,name,category,lat,lng` with **no geometry** and drops
      rich attributes; only 4 themes (**no base / divisions**). Our direct read
      covers all 6 themes with native `geometry`.
    - `geocode()`/`reverse_geocode()` take a bbox as *input* and return address
      **points**, so they do NOT solve named-place→area-extent (that stays the
      divisions spike).
    - Worth adopting à la carte later: `overture_category()` (80+→~30 category
      normalization) for places styling/filtering ([[T-010]]). Optional, not now.
- 2026-07-14: **Browser fetch fixed under [[T-029]]** — the "fetches nothing on
  PC/phone" bug. Root cause was the default zoom-4 viewport globbing the whole
  planet (even places didn't finish in 240 s), doubled by a probe+Arrow
  double-scan and hidden by a swallowed `ensureOvertureAccess` error. Fixed:
  `SET enable_object_cache=true`, materialise each theme once into a temp table
  (local probe now 0.003 s), unswallowed errors → layer row, and a large-extent
  warning in the modal. See [[T-029]] for detail.
  - **Large-extent mitigation follow-up (was "perf caveat" above):** heavy/global
    themes (buildings, transportation) are inherently slow over a wide extent via
    direct `read_parquet` — the file glob dominates. Direction: serve them as
    **PMTiles** (pre-tiled), as GeoLibre (opengeos) does, reusing our ST_AsMVT
    tiler. Not yet ticketed; capture as its own sub-ticket when picked up.
