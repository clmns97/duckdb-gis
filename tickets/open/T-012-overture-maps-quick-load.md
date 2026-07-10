---
id: T-012
title: Overture Maps quick-load (QuickOSM-style) in the catalog
status: open
priority: P2
area: frontend
depends_on: [T-008]
branch:
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
