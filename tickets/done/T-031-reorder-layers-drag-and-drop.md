---
id: T-031
title: Reorder layers by drag-and-drop to control z-order
status: done
priority: P2
area: frontend
depends_on: []
branch: t-025-draw-edit-geometry
---

## Goal

Let the user reorder layers in the Layers panel by dragging one layer above
another, and have that reorder the **map draw order (z-index)** so the layer on
top of the list draws in front on the map — the QGIS Layers-panel behaviour.

## Context

<context>
UX reference: QGIS's Layers panel — drag a layer up to bring it to the front,
down to send it back; list order == draw order (top of list = drawn on top).

The state and render pieces already exist, but nothing reorders them:
  - `frontend/src/lib/layers.ts` — the store keeps `order: string[]`, documented
    as *"newest first — mirrors map draw order (last added on top)"* (line ~60).
    `snapshot()`/`list()` map `order` to `ActiveLayer[]`; the panel renders that
    order. There is **no `reorder`/`move` action** on the store yet — add one
    (e.g. `layers.reorder(id, toIndex)` or `move(fromId, beforeId)`), bumping
    `version` so the panel re-renders.
  - `frontend/src/components/LayersPanel.tsx` — renders `layers.list()` as `<li>`
    rows. Add drag-and-drop here (HTML5 drag events or a small dnd lib — check
    what's already in `package.json` before adding a dep) that calls the new
    reorder action.
  - `frontend/src/lib/deckRender.ts` `syncOverlay()` (line ~456) composes the
    overlay by iterating the `added` Map **in insertion order** (first inserted =
    bottom, last = top). So the store's `order` and the overlay's `added`
    iteration order must be made to agree: reordering the store has to drive the
    overlay's stacking. Decide the single source of truth for z-order and thread
    it through `syncOverlay` (e.g. `addDeckLayer`/a new `setDeckLayerOrder(ids)`
    that reindexes the `added` Map, or have `syncOverlay` sort by an order list).

Watch the direction convention: the store is "newest first" (top of list) while
the overlay draws "last inserted on top" — make the mapping explicit so the
top-of-list layer ends up drawn last (front). The Run-preview `rendered` layer
is always composed on top of the persistent added layers; keep that (it's the
interactive/selection layer).
</context>

## Acceptance criteria

- [x] Dragging a layer above/below another in the Layers panel reorders the list.
- [x] The new list order is reflected on the map: top-of-list layer draws in
      front, bottom draws behind.
- [x] A `reorder`/`move` action exists on the `layers` store and is the single
      source of truth for z-order; `deckRender`'s overlay stacking follows it.
- [x] Reordering doesn't recolour, re-query, or drop layers (styles/visibility
      preserved).
- [x] Keyboard-accessible or at least not breaking existing panel interactions
      (remove, context menu, zoom-to).
- [x] Frontend build + typecheck pass.

## Progress log

- 2026-07-14: Ticket created from user feedback — wants drag-and-drop layer
  reordering to control map z-index. The store already has an `order` array and
  the overlay already stacks; the work is a `reorder` action + DnD in
  `LayersPanel` + making `syncOverlay` follow the store order.
- 2026-07-14: Implemented. **Single source of truth = the store's `order`**
  (newest-first, index 0 = top of list = front). Added `layers.reorder(id,
  toIndex)` (`lib/layers.ts`) — a pure z-order move (no re-query/restyle) that
  rewrites `order` and pushes it down via a new `syncDeckOrder()`. deckRender got
  `setDeckLayerOrder(idsBottomToTop)` + a module `drawOrder`; `syncOverlay()` now
  iterates that order (registered ids missing from it are appended on top so a
  fresh add never drops), replacing raw `added`-Map iteration. The store maps
  top-of-list→front by passing `[...order].reverse()` (deck draws last-in-array
  on top). `add`/`addQuery`/`remove` also call `syncDeckOrder()` to keep the two
  in step. The Run-preview (`rendered`) still composes last (on top). DnD in
  `LayersPanel.tsx`: native HTML5 drag (no dep — none in `package.json`), rows
  `draggable`, top/bottom-half cursor test picks the insertion point, an accent
  bar shows the drop target; the remove button is `draggable={false}` so it stays
  clickable; context menu / remove / zoom-to unaffected. `pnpm build` + `tsc`
  pass.
