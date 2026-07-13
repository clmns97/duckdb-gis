---
id: T-022
title: Zoom to a layer's extent via a right-click context menu
status: open
priority: P2
area: frontend
depends_on: [T-021]
branch:
---

## Goal

In the **Layers** panel, the user right-clicks a layer and picks **Zoom to
layer** (QGIS's "Zoom to Layer(s)"). The map animates to fit that layer's full
extent, so the user can jump to data anywhere on the globe without panning by
hand.

## Context

<context>
UX reference: QGIS — right-click a layer in the *Layers panel* › **Zoom to
Layer(s)**; the canvas fits the layer's bounding box.

Depends on [[T-021]], which introduces the active-layers store, the Layers
panel entries, and the reusable context-menu component. This ticket adds one
action to the Layers-panel menu; it should reuse that menu, not build a new one.

How to compute + apply the extent:
  - Extent via spatial SQL against the layer's source: e.g.
    `SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e)
       FROM (SELECT ST_Extent_Agg("<geom_col>") AS e FROM <db.schema.table>)`
    (confirm the exact aggregate available in the bundled `spatial` build; a
    portable fallback is `min(ST_XMin(geom))` … `max(ST_YMax(geom))`). Query via
    `query` from `frontend/src/lib/duckdb.ts`, quoting idents like elsewhere.
  - Apply via MapLibre: `getMap()` (`frontend/src/lib/mapBus.ts`) →
    `map.fitBounds([[minX,minY],[maxX,maxY]], { padding, duration })`.
    `MapView` is `frontend/src/components/MapView.tsx`.
  - CRS assumption: layers are rendered in lon/lat (EPSG:4326) today, so the
    extent is already in map coordinates — note this assumption; revisit if/when
    reprojection lands.

Edge cases to handle (note decisions in Progress log):
  - Empty layer / all-NULL geometry → no valid extent: leave the view put and
    (optionally) surface a small notice rather than flying to NaN bounds.
  - Single point or degenerate (zero-area) extent → fitBounds to a zero-size box
    picks max zoom; clamp to a sensible maxZoom or pad so it doesn't slam fully
    in.
  - Very large / antimeridian-crossing extents — acceptable to punt, but note it.
</context>

## Acceptance criteria

- [ ] Right-clicking a layer in the Layers panel offers a **Zoom to layer**
      action (reusing the [[T-021]] context menu).
- [ ] Choosing it fits the map to that layer's extent (with padding, animated),
      for layers anywhere on the globe and in attached databases.
- [ ] Empty / null-geometry layers don't move the map to invalid bounds; a
      single-point/degenerate extent lands at a sensible zoom (clamped/padded).
- [ ] Frontend build/lint passes.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-10: Ticket created. Not started. Gated on [[T-021]] (needs the Layers
  panel entries + context menu + active-layers store to hang the action on).
- 2026-07-13: Done. [[T-021]] dep is complete (context menu + active-layers
  store + Layers panel all present). Implementation:
  - `lib/layers.ts`: store the add-time extent on each `ActiveLayer`
    (`bounds`, from the `probeGeometry`/`ST_Extent_Agg` result `addDeckLayer`
    already returns) in both `add` and `addQuery`; new `zoomTo(id)` action
    reuses that extent via the existing `fitTo` (padding + `maxZoom: 14`).
  - `components/LayersPanel.tsx`: right-click a layer row opens the reusable
    `ContextMenu` with a **Zoom to layer** item.
  - Decision: reuse the cached extent rather than re-querying SQL on demand.
    It's the exact extent of what's drawn, needs no round-trip, and works for
    query-backed layers (Overture, T-012) too — which a source-table SQL query
    couldn't reach. Edge cases fall out for free: null bounds (empty / all-NULL
    geometry) → item disabled + `fitTo` no-ops; single-point/zero-area extent →
    `maxZoom: 14` clamp so it lands sensibly, not slammed fully in. Antimeridian
    crossing punted (noted). CRS: layers are lon/lat today, so extent = map coords.
  - `tsc --noEmit` passes.
