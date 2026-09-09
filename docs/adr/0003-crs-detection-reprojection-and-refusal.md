# ADR-0003 — Detect a layer's CRS where DuckDB knows it; reproject or refuse, never render silently wrong

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Tracked by** | #65 |

> **Numbering note.** This was written on a branch cut from `main` before
> [ADR-0002](0002-edit-session-promotes-a-source-to-writable.md) (in flight on
> another branch at the time) had merged. If ADR-0002 lands first, as expected,
> this file keeps its number rather than being renumbered at merge time — see
> `docs/adr/README.md`, "numbers are sequential and never reused," which reads
> more naturally as "never reused *once assigned*" than as a promise about
> merge order across concurrent branches.

## Context

REQ-F-001 detects candidate map layers by column type alone: any `GEOMETRY`
column makes a table renderable (`frontend/src/lib/catalog.ts`). Nothing in
that check, or anywhere downstream in the render path
(`frontend/src/lib/deckRender.ts`, `frontend/src/lib/layers.ts`), considers
the coordinate reference system. UC-001 extension 4b names the resulting gap:
*what happens when a layer's geometry isn't in WGS84?*

**What DuckDB spatial actually gives us, verified against the pinned build:**

- A geometry value's CRS is carried as a **type annotation**, not row data:
  plain `GEOMETRY` is CRS-less; `GEOMETRY('EPSG:32633')` (or `'OGC:CRS84'`,
  etc.) carries one, readable back with `st_crs()`. Verified this annotation
  **survives `CREATE TABLE AS SELECT`** — it's a real, persistent per-column
  property of a materialized table, not just an expression-level tag that
  evaporates on write.
- `ST_Transform(geom, '<source>', 'EPSG:4326', always_xy := true)` reprojects
  correctly. Verified round-tripping a UTM 33N point through it and back to
  the expected Vienna coordinates.
- **Where an annotation would come from in practice:** `ST_Read()` (the
  GDAL-backed vector reader) tags its output with a CRS — confirmed against a
  synthetic fixture. GeoParquet carries one too (already known before this
  ADR — see `frontend/src/lib/overture.ts`'s `::GEOMETRY` cast, which strips
  exactly this annotation to dodge an unrelated aggregate-function bug).
  A **plain hand-built or attached `.duckdb` table has none** — this is
  the common case for "data you already have" (UC-001's own framing), and no
  metadata exists anywhere to recover it. There is no `spatial_ref_sys` table
  in a fresh DuckDB instance to fall back on.
- **REQ-F-001's detection query itself is broken for annotated geometry**:
  `WHERE data_type = 'GEOMETRY'` is an exact string match, and an annotated
  column reports `data_type` as the literal string `GEOMETRY('EPSG:32633')` —
  a table read via `ST_Read()`, or any GeoParquet read that doesn't strip the
  annotation the way `overture.ts` does, is invisible to layer detection
  entirely. This is a pre-existing bug, independent of CRS handling, that
  this ADR's fix has to correct first — there's no point reprojecting a
  column the catalog never offered as a layer.

**Current behaviour, established live (not assumed) against the running app,
before any fix:**

1. A projected point whose magnitude puts it outside `[-180,180]×[-90,90]`
   (e.g. UTM 33N `(603842, 5335120)`) — MapLibre's `fitBounds` throws
   `Invalid LngLat latitude value: must be between -90 and 90` when the layer
   add tries to frame the camera. The layer is caught and shown with
   `status: "error"`. This looks like a safety net, but isn't one by design:
   `addDeckLayer` already added the geometry to the deck.gl overlay
   *before* `fitBounds` is called — the render happened; only the
   camera-framing step failed, and only because MapLibre happens to validate
   latitude. Nothing validates the geometry itself.
2. A projected point whose magnitude happens to fall inside valid lon/lat
   range — confirmed with `(60.3842, 53.3512)`, meant to represent something
   else entirely — renders with `status: "ready"`, no error, framed
   correctly by `fitBounds` (which has no way to know the numbers are
   nonsense), at a real-looking location (Chelyabinsk, Russia) that has
   nothing to do with the source data. Screenshotted for the record. This is
   the failure mode REQ-F-001/UC-001 4b worries about: **silently wrong**,
   indistinguishable from correct data at a glance.

## Decision

Three tiers, applied in order, at the point a catalog-table layer's `geom`
column is resolved into the SQL every render/probe/frame step uses
(`frontend/src/lib/layers.ts`, currently `sourceSql`):

1. **Known CRS, not WGS84 → reproject on the fly.** If the column's type
   carries a CRS annotation (`st_crs()` non-null) and it isn't
   `EPSG:4326`/`OGC:CRS84`, wrap the column in
   `ST_Transform(geom, '<crs>', 'EPSG:4326', always_xy := true)`. Covers data
   read through `ST_Read()` or any GeoParquet path that preserves its
   annotation — the cases where DuckDB itself actually knows the answer.
2. **Unknown CRS, implausible-for-WGS84 extent → refuse with an explanation.**
   The existing add-time extent probe (`deckRender.ts` `probeGeometry`,
   already computed for every layer add — no new query) is checked against
   `[-180,180]×[-90,90]` *before* anything is added to the deck overlay or
   the camera is touched. Out of range throws a specific, readable error
   ("this looks like a projected coordinate system, not WGS84") instead of
   the accidental, misleading MapLibre exception, and instead of rendering
   first and failing to frame second.
3. **Unknown CRS, plausible extent → render as today.** No annotation exists
   to reproject from, and the coordinates aren't *provably* wrong. This is
   also the overwhelmingly common real case: nearly everything this app's
   own pipeline produces (drawn geometry, `ST_GeomFromGeoJSON`, Overture's
   already-WGS84 reads, most hand-built demo/working tables) is plain,
   unannotated, and genuinely WGS84. Silent-and-correct is not the problem
   this ADR exists to fix.

Layer Info's existing `crs` field (`layers.ts`, `LayerInfo.crs` — placeholder
since T-011, documented as "unknown for plain GEOMETRY today") is wired to
this same detection, so a reprojected layer visibly says so rather than just
silently working.

Scope: this covers **catalog-table layers** — the `layers.add`/`refresh`
path REQ-F-001/002 and UC-001 4b are about. `query`-backed layers
(SQL-editor Run, Overture quick-load, geoprocessing results) are arbitrary
user SQL the caller already projects a `geom` column from; reprojecting
those transparently would mean rewriting SQL the user didn't write, which is
a different and much less clearly-scoped problem. Tier 2's hard bounds
guard, however, sits in the shared `probeGeometry` used by *every* render
path (table layers, query layers, and the SQL-editor preview alike) — so the
one thing every path gets for free is never silently rendering a
provably-impossible extent, regardless of how the SQL was constructed.

## Consequences

**Good.**

- Closes UC-001 4b: the three tiers are an explicit, recorded answer instead
  of "undecided."
- The one bug that was structurally silent (tier 3's predecessor, `local_test`
  above) is narrowed to a case that's provably undetectable without more
  information than DuckDB has — not left unaddressed by omission.
- Fixes the REQ-F-001 detection gap for annotated geometry as a side effect
  of needing it to reach tier 1 at all — a real, previously-unknown bug this
  investigation surfaced.
- Tier 2's guard is a strict improvement even for today's accidental
  safety net: it fires *before* the geometry reaches the overlay (not
  after), with a specific message (not MapLibre's generic latitude
  complaint), and consistently (not only when the *latitude* happens to be
  the axis that's out of range).

**Bad.**

- Tier 3's gap is real and accepted, not solved: a projected dataset whose
  coordinate magnitudes happen to look like valid lon/lat (small-scale local
  grids, some State Plane systems in certain units) still renders silently
  wrong if it was never CRS-annotated. The only way to close this fully is
  either requiring every source to carry CRS metadata (not realistic — most
  won't) or a manual "declare this layer's CRS" override, which is real,
  user-facing scope beyond what #65 asks for. Noted as follow-on work, not
  built here.
- Reprojection is per-layer, at render/probe time, not cached or
  materialized — a large annotated layer pays `ST_Transform` on every
  add/refresh. Matches how every other per-layer SQL in this codebase
  already works (no materialization step exists for plain WGS84 layers
  either), so this isn't a new class of cost, but it's worth naming.
- `always_xy := true` is asserted, not verified per-CRS. It's the right
  setting for every case tested (UTM, CRS84) and matches this codebase's
  existing convention (`tiles.ts`'s own `ST_Transform` call uses the same
  flag) but PROJ's axis-order handling has enough history of surprises that
  a CRS this hasn't been tested against could misbehave. Not a known issue,
  named because it's plausible.

**Follow-on work.**

- A manual per-layer CRS override ("declare this layer's CRS") for tier 3's
  gap — the natural next step if it proves to matter in practice, not filed
  as an issue yet since #65 doesn't ask for it.
- `query`-backed layers get tier 2's guard for free but not tier 1's
  reprojection; extending reprojection to them (SQL-editor results,
  geoprocessing output referencing a non-WGS84 source) is unscoped here.

## Alternatives considered

**Always refuse when CRS is unknown, even at a plausible extent.** The
"loudly broken" end of the spectrum the issue explicitly weighs against
"silently wrong." Rejected: it would refuse the overwhelming majority of
today's working layers (everything this app itself produces is plain,
unannotated GEOMETRY), for a risk that mostly doesn't apply to them. Matching
the actual risk (implausible extent) rather than the proxy (annotation
absence) is a much better precision/recall trade.

**Build a `spatial_ref_sys`-style lookup and always ask the user to pick a
CRS on add.** Closes tier 3 completely, but is real, scoped UI/UX work (a
picker, a searchable EPSG registry, a default-guessing heuristic) that #65's
acceptance criteria don't ask for and that would roughly double this
ticket's size. Left as the follow-on it's noted as above, not built now.

**Reproject via a materialized column instead of on-the-fly `ST_Transform`
in the render query.** Would avoid repeated transform cost on every
add/refresh. Rejected for now: it would mean writing into the source table
(or the working catalog) at add time, which is a bigger behavioural change
than this ticket's scope, and per-layer reprojection cost hasn't been shown
to matter yet — revisit if it does.

## References

- `frontend/src/lib/catalog.ts` — REQ-F-001 detection, the exact-match bug
- `frontend/src/lib/layers.ts` — `sourceSql`, `LayerInfo.crs`
- `frontend/src/lib/deckRender.ts` — `probeGeometry`, `addDeckLayer`,
  `renderGeoArrow`
- `frontend/src/lib/tiles.ts` — the codebase's one prior `ST_Transform` /
  `always_xy` precedent (MVT tile path, EPSG:3857 for rendering, not CRS
  detection)
- `docs/requirements/use-cases/UC-001-put-existing-data-on-the-map.md`,
  extension 4b
- `docs/requirements/register.md` REQ-F-001, REQ-F-002, REQ-F-008 (this
  decision)
- Issue #65
