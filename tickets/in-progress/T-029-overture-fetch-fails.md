---
id: T-029
title: Overture Maps quick-load fetches nothing on desktop & mobile
status: in-progress
priority: P1
area: frontend
depends_on: [T-012]
branch: t-025-draw-edit-geometry
---

## Goal

The Overture Maps quick-load ([[T-012]]) never returns data for the user — "I
could not get it to fetching anything on my pc and phone." Make the Overture
load actually pull features onto the map from a normal desktop *and* a phone on
the tailnet, or surface a clear, actionable error when it can't. Right now it
appears to silently do nothing.

## Context

<context>
[[T-012]] wired the real data path: direct GeoParquet-on-S3 via `read_parquet`,
no community extension. The relevant code:
  - `frontend/src/lib/overture.ts` — theme catalog, `OVERTURE_RELEASES`
    (`2026-06-17.0`, `2026-05-20.0`), extent resolution (`viewportBbox`,
    `selectionBbox`), and `buildOvertureQuery` (partition layout
    `theme=<t>/type=<ty>/`, `geometry`→`geom`, `bbox`-overlap predicate).
  - `frontend/src/lib/remote.ts` — `ensureOvertureAccess()` brings up httpfs +
    anonymous S3 access (the [[T-008]] plumbing).
  - `frontend/src/components/OvertureModal.tsx` — the form.
  - `frontend/src/App.tsx:104` `loadOverture` — resolves the bbox and calls
    `layers.addQuery` per theme; note it does `await ensureOvertureAccess()
    .catch(() => {})` — **failures to bring up httpfs are swallowed**, so a
    missing-httpfs / no-network condition would produce "nothing happens."

Known suspects, in rough priority — investigate before fixing:
  1. **Whole-planet glob = timeout, not empty.** T-012's own perf caveat:
     buildings/transportation over a viewport take *minutes* because the read
     globs the whole-planet file set before the bbox predicate prunes. On a slow
     link (phone) or with the HTTP request timeout in `duckdb.ts` / the extension
     server, this reads as "fetching nothing." Check whether the query is timing
     out vs. actually returning 0 rows.
  2. **Silent httpfs failure.** `ensureOvertureAccess().catch(() => {})` hides
     setup errors; if httpfs/anonymous-S3 isn't available the subsequent read
     errors — verify it actually surfaces on the layer row, and stop swallowing.
  3. **Release validity.** If `OVERTURE_RELEASES` has drifted past what the bucket
     serves, the path 404s. Verify the pinned releases still resolve (T-012 left
     "live release listing" as a follow-up).
  4. **Mobile/network specifics.** Phone hits the app via the tailnet preview;
     confirm S3 egress works from that environment at all (the extension server
     does the fetch, not the phone — so this is more about the *server's*
     egress + timeout than the device).

Reproduce first: run the exact `buildOvertureQuery` SQL for a small theme
(places) over a small viewport directly in `./build/release/duckdb` to isolate
data path vs. UI, then in the running UI (use the `preview` skill for the phone).
</context>

## Acceptance criteria

- [ ] Root cause identified and recorded (timeout / swallowed error / bad release
      / egress) — with the reproduction.
- [ ] A small theme (e.g. places) over the current viewport loads features onto
      the map on desktop.
- [ ] Failures and long-running loads are no longer silent: httpfs/access errors
      surface on the layer row (stop swallowing in `loadOverture`), and a
      slow/large fetch shows progress or a clear "this may take minutes / narrow
      the extent" affordance.
- [ ] Verified working (or a clear error) from a phone via the tailnet preview.
- [ ] Frontend build + typecheck pass.

## Progress log

- 2026-07-14: Ticket created from user report — Overture quick-load fetches
  nothing on PC and phone. Prime suspects: whole-planet glob timeout (T-012 perf
  caveat) and the swallowed `ensureOvertureAccess` error in `App.tsx`
  `loadOverture`. Split out from the [[T-012]] umbrella as a concrete bug.
- 2026-07-14: **Root cause found + fixed.** Reproduced the data path directly in
  `./build/release/duckdb`:
  - Releases valid (both in bucket via S3 list API); the query shape is already
    Overture's documented fast path — **not** a bad query or 404.
  - **Primary cause: the default map view is zoom 4** (`MapView.tsx`, ~all of
    Europe). "Current viewport" → a ~50°×30° bbox that barely prunes, so the read
    globs the whole-planet fileset. Even *places* over that extent **did not
    finish in 240 s** (vs ~13 s for a city viewport). PC and phone fail identically
    — the extension server does the S3 fetch, so the phone is not special.
  - **Compounding:** the render path scanned the source **twice** (probe +
    Arrow), doubling wall time; no metadata cache; and `ensureOvertureAccess()
    .catch(()=>{})` swallowed setup errors, so a slow load and a failed load
    looked identical (nothing on the map).
  - **Fixes (frontend only, no rebuild):**
    1. `SET enable_object_cache=true` at bootstrap — cache parquet footers across
       queries (measured 12.6 s → 1.2 s on a repeat scan).
    2. `loadOverture` materialises each theme's S3 read into a TEMP TABLE **once**
       via `addQuery`'s new `prepare` hook, then renders from the local table —
       the render probe now reads the local table in **0.003 s** instead of a
       12–28 s S3 re-scan (verified on the real binary).
    3. Stopped swallowing errors: httpfs/S3/materialise failures run inside
       `prepare` and surface on the layer row (existing error lifecycle);
       errored layers can be retried (dedupe now yields on `status==="error"`).
    4. `OvertureModal` warns (allow-anyway) when the viewport extent is large
       (`isLargeExtent`, >5° span), nudging the user to zoom into a city.
  - Verified: `pnpm typecheck` + `pnpm build` pass; served app + SQL-over-HTTP
    proxy round-trip live (Vite 200 / proxied `/info` 200). **Remaining:** click
    through the running GUI on desktop + phone (preview URL) to confirm render.
  - **Follow-up (out of scope, note on [[T-012]]):** heavy/global themes
    (buildings, transportation) stay slow over a wide extent — the direct-read
    path can't tile. GeoLibre (opengeos) serves those as **PMTiles**; that's the
    right direction and fits our existing ST_AsMVT tiler. Filed as future work.
- 2026-07-14 (2): **Real GUI blocker found — a spatial WKB/aggregate bug, now
  fixed.** User retested via the GUI (buildings) and it still failed. The load
  request (materialise) *succeeded*, but the render probe returned "Invalid Input
  Error: Only little-endian WKB is supported". Reproduced and isolated in
  `duckdb` directly:
  - `read_parquet` types Overture geometry as `GEOMETRY('OGC:CRS84')` (CRS-
    annotated). Per-row ops (`ST_GeometryType(geom)`, `ST_XMin(geom)`) and the
    GeoArrow encoder (`st_asgeoarrowpolygon`) decode every row fine — so the
    geometry is valid, not actually big-endian.
  - The failure is spatial's **geometry-typed aggregates**: combining
    `any_value(geom)` with `ST_Extent_Agg(geom)` over the same column throws the
    spurious WKB error for polygon themes (buildings/base/divisions). Places
    (POINT) slipped through, which is why the earlier CLI check missed it.
  - **Fixes:**
    - `probeGeometry` (deckRender.ts) now uses **per-row scalars** —
      `any_value(ST_GeometryType(geom))`, `min/max(ST_XMin(geom)…)` — instead of
      `ST_GeometryType(any_value(geom))` + `ST_Extent_Agg(geom)`. Avoids the buggy
      geometry-aggregate path; strictly more robust for all layers.
    - `buildOvertureQuery` projects `geometry::GEOMETRY` (strips the CRS
      annotation) so Overture layers carry the same plain `GEOMETRY` every other
      layer uses and the encoder gets a clean type.
  - Verified in `duckdb`: buildings single-file probe + encoder now succeed
    (POLYGON, full extent); places full-glob end-to-end unchanged (POINT, 411).
    typecheck + build pass. Live on the Vite preview (HMR).
  - Note: buildings/transportation are **512 files** vs places' 16 — they load
    but stay slow over a wide extent (the PMTiles follow-up above). Places /
    addresses / divisions are the interactive themes today.
  - **All 6 themes verified** (new probe + cast, one file each): places/addresses
    → POINT, transportation → LINESTRING, buildings/base → POLYGON, divisions →
    MULTIPOLYGON. All map to existing render SPECS. Probe on 3k local features is
    3–37 ms (multipolygons the slowest) — negligible vs the S3 read, so the probe
    change has no meaningful perf cost; net faster since materialize-once removed
    the second S3 scan. Speed differences between themes are purely file count:
    divisions 8, places 16, addresses/base 32, transportation 128, buildings 512.
  - **Still to confirm:** user click-through in the GUI (places fast, buildings
    slow-but-working) on desktop + phone.
