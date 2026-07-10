---
id: T-021
title: Add a catalog table to the Layers panel via a right-click context menu
status: open
priority: P1
area: frontend
depends_on: [T-001]
branch:
---

## Goal

From the Browser panel (the attached-databases catalog tree), the user
right-clicks a geometry-bearing table and picks **Add to map** (QGIS calls this
"Add Layer"). The table appears as a new entry in the **Layers** panel and its
features render on the map. This is the primary way to get data onto the map
without hand-writing SQL in the editor.

Because no app-level notion of "a layer added to the map" exists yet, this
ticket also introduces the minimal **active-layers model** (the store the
Layers panel renders from and the map draws) — the foundation that later layer
work (styling [[T-010]], info [[T-011]], zoom-to [[T-022]]) builds on.

## Context

<context>
UX reference: QGIS — right-click a table in the *Browser panel* › **Add Layer
to Project**; the layer then lives in the *Layers panel*. We want the same
gesture: context menu on a catalog table → it becomes an active layer.

Current state (nothing persistent exists yet):
  - The Layers section is **hardcoded** `"No layers yet"` —
    `frontend/src/App.tsx:70–78`. There is no layers state, store, or list.
  - Catalog table nodes are inert `<li className="node indent-2">` with just an
    icon + name — `frontend/src/App.tsx:111–118`. No click/context handlers.
  - The only paths to the map today are the SQL editor Run →
    `renderGeoArrow(sql)` (`frontend/src/lib/deckRender.ts:218+`, ephemeral —
    not a tracked layer) and the MVT tile path
    (`frontend/src/lib/tiles.ts` — `prepareTileLayer` builds an R-tree index +
    `addTileLayer(spec)` adds a MapLibre source/layer). Both are currently
    driven only from the dev console seam `window.gisTiles` / `window.gisDeck`
    (`App.tsx:35–48`).
  - The MapLibre map handle comes from `getMap()` in
    `frontend/src/lib/mapBus.ts`; `MapView` is `frontend/src/components/MapView.tsx`.

Depends on [[T-001]]: geometry detection tells us which tables are usable
layers and *which* geometry column to render (a table may have several). The
"Add to map" action should be offered on geometry-bearing tables and must know
the (db, schema, table, geom_column) to build the render.

Design decisions to make (record in Progress log):
  - **Active-layers store shape.** A layer minimally needs: a stable id, a
    display name, source ref (db.schema.table + geom_column), a render handle
    (which render path it used), and visibility. Recommend a small module
    (`frontend/src/lib/layers.ts`) exposing a subscribable store +
    `addLayer(source)` / `removeLayer(id)`, mirroring how `selection` is a
    standalone store (`frontend/src/lib/selection.ts`) rather than threading
    React context everywhere.
  - **Which render path.** Recommend the tile path (`tiles.ts`) as the default
    for table-backed layers so large tables stay performant, falling back to /
    or reconciled with the Arrow path. Confirm against how `MapView` layers
    stack. Note the choice; don't build both if one suffices.
  - **Fully-qualified table refs.** Build the FROM target as
    `"db"."schema"."table"` (quote idents) so attached-db tables work, matching
    T-001's cross-database detection. `tiles.ts:38` already takes a table
    string.
  - Context menu component: none exists yet — add a small reusable one (right
    now only the catalog tree needs it, but the Layers panel will too for
    [[T-022]] / remove-layer, so make it reusable).

Interplay: [[T-002]] splits the sidebar into Layers/Browser tabs. This ticket
can land before or after T-002 — target the existing Layers section either way;
if T-002 has landed, the new layer entries live under its Layers tab.
</context>

## Acceptance criteria

- [ ] Right-clicking a geometry-bearing table in the catalog tree opens a
      context menu with an **Add to map** action (only offered for tables that
      T-001 flags as geometry layers).
- [ ] Choosing it adds the table to an active-layers store and renders its
      features on the map at the correct location.
- [ ] The **Layers** panel renders one entry per active layer (name + a way to
      remove it), replacing the hardcoded "No layers yet" when layers exist and
      restoring the empty state when the last layer is removed.
- [ ] Works for tables in **attached** databases, not just the default one
      (fully-qualified, quoted table refs).
- [ ] Adding the same table twice is handled sanely (either dedupe or allow a
      second instance — pick one and note it).
- [ ] Active-layers store lives in its own module and is documented as the
      foundation for [[T-010]] / [[T-011]] / [[T-022]].
- [ ] Frontend build/lint passes; menu + Layers list render correctly light and
      dark (`frontend/src/lib/tokens.css`).

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-10: Ticket created. Not started. Gated on [[T-001]] (need geometry
  detection + geom column before an "Add to map" action is meaningful). This is
  the ticket that introduces the active-layers model; [[T-022]] (zoom-to)
  builds on it.
