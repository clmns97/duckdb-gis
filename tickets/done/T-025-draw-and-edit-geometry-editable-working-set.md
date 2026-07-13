---
id: T-025
title: Draw and edit geometry via an editable GeoJSON working set
status: open           # open | in-progress | blocked | done
priority: P2           # P0 (now) | P1 | P2 | P3
area: frontend         # frontend | src (C++) | ts | build | docs
depends_on: [T-003]    # selection set is the on-ramp for edit-in-place
branch:                # set once work starts, e.g. t-025-draw-edit-geometry
---

## Goal

The user can draw new features (point / line / polygon / rectangle) on the map
and edit existing feature geometry (move vertices, drag, delete) with a QGIS-like
digitizing toolbar, then commit those edits back into DuckDB. "Done" means: a
user can create a scratch layer, sketch features into it, edit their vertices,
and persist the result as a native DuckDB table — without the fast read-only
render path regressing.

## Context

<context>
This came out of studying **GeoLibre** (github.com/opengeos/GeoLibre), a
local-first GIS with an almost-mirror-image architecture: DuckDB-in-the-browser
(WASM) + MapLibre. Their editing is a plugin
(`packages/plugins/src/plugins/maplibre-geo-editor.ts`) backed by **Geoman**
(`@geoman-io/maplibre-geoman-free`) wrapped in `maplibre-gl-geo-editor`. Draw
modes: polygon, line, rectangle, circle, marker, freehand, text. Edit modes:
select, drag, vertex-change, rotate, scale, cut, delete, split, union,
difference, simplify, lasso.

**The load-bearing lesson from their design:** editing only works on
**GeoJSON-mode** layers. Their `canEditLayerGeometry`
(`geo-editor-geometry.ts`) explicitly excludes their DuckDB "vector-tiles"
layers — the columnar/tiled display path is read-only. Editing needs mutable,
per-feature, GeoJSON-shaped data on a MapLibre source; drawing libs (Geoman,
Terra Draw, mapbox-gl-draw) all operate on MapLibre's own GeoJSON sources and
event model.

**Why this matters for us specifically:** our render path is native
**GeoArrow → deck.gl** (`frontend/src/lib/deckRender.ts`). Geometry is encoded
server-side by the `duck_geoarrow` extension's `st_asgeoarrow*` functions,
shipped as Arrow IPC via `to_arrow_ipc`, and handed straight to
`@geoarrow/deck.gl-geoarrow` layers (`GeoArrowScatterplotLayer` /
`GeoArrowPathLayer` / `GeoArrowPolygonLayer`). Those buffers are **immutable and
columnar**, and deck.gl is a *display* overlay (`MapboxOverlay`) that does no
interactive vertex editing. So editing cannot happen on that path.

The answer (which GeoLibre validates) is a **two-representation model**:
- Read-only, large layers → keep the native GeoArrow → deck.gl path unchanged.
- The **editable working set** → a small **MapLibre GeoJSON source** managed by a
  drawing library, rendered by MapLibre itself (not deck.gl), sitting alongside
  the deck.gl overlay.

On commit, write the edited GeoJSON back into DuckDB **natively** (e.g.
`ST_GeomFromGeoJSON` + `CREATE TABLE`/`UPDATE ... WHERE fid = ?`). This is our
advantage over GeoLibre: their write-back goes through a Python PostGIS sidecar
(`backend/geolibre_server/app/postgis.py`) with per-row parameterized
INSERT/UPDATE/DELETE; ours can hit the in-process DuckDB directly.

Library choice: evaluate **Terra Draw** (MapLibre-native, actively maintained,
lighter, plays well next to a deck.gl overlay) vs **Geoman** (what GeoLibre uses;
richer built-in edit ops but heavier). Lean Terra Draw unless we specifically
need Geoman's union/difference/simplify on-canvas ops (those can also be done as
DuckDB spatial SQL, which is more on-brand for this project).

Relevant existing code:
- `frontend/src/lib/deckRender.ts` — the read-only GeoArrow render path; the
  `__fid` tagging (`selection.ts`, `fidTaggedRelation`) is how picked features
  map back to source rows. Reuse this fid scheme for edit-in-place.
- `frontend/src/lib/mapBus.ts` (`getMap`) — the shared MapLibre instance a draw
  control would attach to.
- `frontend/src/lib/layers.ts`, `frontend/src/components/LayersPanel.tsx` —
  where an editable "scratch" / working-set layer type would surface in the UI.
- T-003 (select features on the map) — selection is the on-ramp for
  "edit the selected feature's geometry in place".

Scope note: keep the first cut to **draw + vertex edit + delete on a scratch
layer, committed to a new DuckDB table**. Edit-in-place of an existing large
layer, and on-canvas union/difference, are follow-ups.
</context>

## Acceptance criteria

- [x] A drawing library (Terra Draw) is wired to the shared MapLibre map,
      rendering an editable working set as MapLibre-native layers (separate from
      the deck.gl overlay; deck flipped to `interleaved:true` so the working set
      stacks above deck geometry).
- [x] User can draw point, line, and polygon features into a scratch layer.
- [x] User can select a drawn feature and edit its vertices (move/add via
      midpoint/delete) and delete whole features (Terra Draw select-mode flags +
      `deleteSelected()`).
- [x] The read-only GeoArrow → deck.gl render path is unchanged and still
      renders added layers correctly alongside the editable source (verified:
      point + polygon render over the basemap, 0 console errors).
- [x] "Commit" writes the working-set GeoJSON into a native DuckDB table via
      `ST_GeomFromGeoJSON` (no Python sidecar), and the committed layer is
      re-rendered through the normal GeoArrow path (`layers.addQuery`).
- [~] The committed scratch layer appears in the Layers panel as a normal layer
      (visible, zoom-to, remove). A per-layer *visibility toggle* is a
      pre-existing panel gap (absent for every layer, not just scratch) — out of
      scope here; tracked separately.
- [x] Build passes (`pnpm typecheck` + `pnpm build`). Frontend-only change; no
      C++/extension code touched, so `make` / `test/unittest` are unaffected.

## Progress log

<!-- Append newest entries at the bottom. Each: what changed, what's next,
     any blocker. This is what makes a token reset survivable. -->
- 2026-07-12: Ticket created from GeoLibre research. Key decision recorded: use a
  two-representation model (immutable GeoArrow for display, a MapLibre GeoJSON
  source for the editable working set), commit back to DuckDB natively. Next:
  spike Terra Draw vs Geoman against the existing `MapboxOverlay` in
  `deckRender.ts`.
- 2026-07-13: **First cut implemented on branch `t-025-draw-edit-geometry`.**
  Library: **Terra Draw** `1.32.0` + `terra-draw-maplibre-gl-adapter` `1.4.1`
  (peer `maplibre-gl >=4`, satisfied by our `^5.24`). Two user decisions this
  session: toolbar as an on-canvas control; deck flipped to `interleaved:true`
  now (so the editable working set stacks above deck layers).
  - `frontend/src/lib/editing.ts` (new) — subscribable store (mirrors
    `selection.ts`/`layers.ts`) owning the Terra Draw lifecycle: adapter with
    `prefixId:"td-"`, modes point/linestring/polygon + a select mode with
    per-geometry edit flags (drag feature, drag vertex, midpoint insert, vertex
    delete). `init()` guards `start()` on style load. API: `setMode`,
    `isEditing`, `featureCount`, `selectedCount`, `deleteSelected`, `clear`,
    `snapshot`, `commit`, `destroy`. `commit()` writes the working set to
    `main.scratch_<n>` (index chosen by scanning existing tables so a
    file-backed DB never collides) via a `VALUES` list of `ST_GeomFromGeoJSON`
    literals (single generic `GEOMETRY` column), then re-renders one layer per
    geometry family via `ST_Dimension` split (deck probes a single type/layer,
    so mixed geometry would otherwise be dropped) through `layers.addQuery`.
  - `frontend/src/lib/deckRender.ts` — `MapboxOverlay` → `interleaved:true`;
    injected draw hooks (`setDrawHooks`, `requestSync`) keep it a leaf (no
    `editing` import): `handleClick` early-returns while `isEditing()` so Terra
    Draw owns clicks; deck layers cloned with `beforeId = bottomLayerId()` so
    they render beneath the working set.
  - `frontend/src/components/DrawToolbar.tsx` (new) — on-canvas control (mode
    buttons + Delete + green Commit w/ count badge + inline error); mounted in
    `MapPanel.tsx` (which also wires `editing.destroy()` teardown).
  - `App.tsx` — DEV `window.gisEditing` + `window.gisQuery` seams.
  - **Verified** (Playwright vs. the preview servers): typecheck + build clean;
    read-only path renders point + polygon over the basemap with **0 console
    errors** (no interleaved regression, no Terra Draw/maplibre-v5 conflict);
    drew a polygon via real pointer events; Commit created `main.scratch_1`
    (2 POLYGON rows, visible in the Browser catalog) and reset the working set
    to empty/static.
  - **Follow-ups (not this cut):** edit-in-place of an existing large layer
    (T-003 selection on-ramp); on-canvas union/difference (do as DuckDB spatial
    SQL); a per-layer visibility toggle in the Layers panel (pre-existing gap);
    commit could drop zero-area/degenerate features. Terra Draw also ships
    circle/rectangle/freehand modes we could expose later.
