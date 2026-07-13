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

- [ ] A drawing library (Terra Draw or Geoman) is wired to the shared MapLibre
      map, rendering an editable working set as a MapLibre GeoJSON source
      (separate from the deck.gl overlay).
- [ ] User can draw point, line, and polygon features into a scratch layer.
- [ ] User can select a drawn feature and edit its vertices (move/add/delete)
      and delete whole features.
- [ ] The read-only GeoArrow → deck.gl render path is unchanged and still
      renders added layers correctly alongside the editable source.
- [ ] "Commit" writes the working-set GeoJSON into a native DuckDB table via
      `ST_GeomFromGeoJSON` (no Python sidecar), and the committed layer can then
      be re-rendered through the normal GeoArrow path.
- [ ] The scratch/working-set layer is visible and toggleable in the Layers
      panel.
- [ ] Tests / build pass (`make`, `./build/release/test/unittest`).

## Progress log

<!-- Append newest entries at the bottom. Each: what changed, what's next,
     any blocker. This is what makes a token reset survivable. -->
- 2026-07-12: Ticket created from GeoLibre research. Key decision recorded: use a
  two-representation model (immutable GeoArrow for display, a MapLibre GeoJSON
  source for the editable working set), commit back to DuckDB natively. Next:
  spike Terra Draw vs Geoman against the existing `MapboxOverlay` in
  `deckRender.ts`.
