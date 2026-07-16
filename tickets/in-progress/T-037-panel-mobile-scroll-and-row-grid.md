---
id: T-037
title: Lock left-panel to vertical scroll on touch + align rows on a shared grid
status: in-progress
priority: P2
area: frontend
depends_on: []
branch:
---

## Goal

On a phone, the Layers and Browser panel contents stay pinned on the horizontal
axis — a drag/swipe only scrolls vertically, never slides the row contents left
or right. Row icons are never clipped, and the ⋮ (kebab) action buttons line up
in a single column across both the data-layer rows and the pinned Basemap row.
"Done" means: no horizontal drift on touch, no cut-off glyphs, and a visually
consistent row grid.

## Context

<context>
Two coupled problems, both in the left sidebar.

**1. Horizontal drift on touch.** The panel body is
`App.tsx:290-296` — an `<aside class="w-[300px] … overflow-hidden">` wrapping a
scroll container `<div class="flex-1 min-h-0 overflow-y-auto …">` (App.tsx:291)
that holds `<LayersPanel/>` and the Browser tree. `overflow-y-auto` leaves
`overflow-x` at its default (visible), and the layer rows are `draggable` HTML5
elements (`LayersPanel.tsx:123` — the T-031 reorder gesture). On a touch device
this lets a horizontal swipe pan/rubber-band the row contents sideways and can
clip the leading Eye / swatch icons. Likely fix: constrain the scroll container
to vertical only — `overflow-x-hidden` + `touch-action: pan-y` (and/or
`overscroll-behavior-x: none`) — while keeping the draggable reorder working with
a pointer. Verify the desktop drag-to-reorder still functions after adding
`touch-action`.

**2. Kebab / row misalignment.** Rows are ad-hoc flexbox, so the trailing
controls don't line up between sections:
- A **data-layer row** (`LayersPanel.tsx:115-214`) is: Eye button (`w-4`) ·
  color swatch (`w-3`) · name (`flex-1`) · optional temp/loading/error chips ·
  GripVertical (hover) · ⋮ kebab (`w-6`, LayersPanel.tsx:190-201) · X remove
  (`w-4`, LayersPanel.tsx:202-213).
- The pinned **Basemap row** (`LayersPanel.tsx:220-241`) is: MapIcon (`w-4`) ·
  name (`flex-1`) · "basemap" label · ⋮ kebab (`w-6`) — **no** trailing X.

So the kebab is the last element on the basemap row but the second-to-last on
layer rows, and the two kebabs land at different x positions. A shared grid (e.g.
a fixed leading icon column, a flexible name column, and a fixed trailing
actions column of consistent width for both row types) would make the kebabs — and
the leading glyphs — line up. Consider a small reusable row layout so the layer
row, the basemap row, and any future pinned rows share one column template.

Related: the color swatch at `LayersPanel.tsx:154-157` is being replaced by a
geometry-typed symbology glyph in **T-039** — coordinate the leading-icon column
so both land cleanly. Row height is `h-7`; negative margins `-mx-3` bleed rows to
the panel edge (App.tsx padding is `p-3`).
</context>

## Acceptance criteria

- [~] On touch, a vertical swipe scrolls the panel; the row contents do not slide
      or rubber-band horizontally (code done — Part 1; preview check pending).
- [x] No leading icon (Eye, swatch/glyph, MapIcon) is clipped in any state.
- [x] The ⋮ kebab buttons align in one column across data-layer rows and the
      pinned Basemap row (and any other pinned rows).
- [~] Desktop drag-to-reorder (T-031) still works after the touch-action change
      (`touch-action` doesn't affect pointer drag; preview check pending).
- [x] `pnpm --dir frontend typecheck` and `build` pass; [ ] exercised in the preview.

## Progress log

- 2026-07-16: Opened from mobile testing. Two coupled issues: (1) `overflow-y-auto`
  container (App.tsx:291) leaves horizontal overflow/pan open on touch, clipping
  icons; (2) layer rows vs the pinned basemap row use ad-hoc flex so kebabs don't
  align. Proposed: `overflow-x-hidden` + `touch-action: pan-y`, and a shared row
  grid template. Coordinate the leading-icon column with T-039 (symbology glyph).
- 2026-07-16: **Part 1 (touch scroll lock) done**, alongside T-039. The panel
  scroll container (App.tsx:291) now carries `overflow-x-hidden touch-pan-y
  overscroll-x-none` so a touch swipe only pans vertically; desktop pointer
  drag-to-reorder (T-031) is unaffected by `touch-action`. Ticket stays open for
  **Part 2 (shared row-grid / kebab alignment)** across data-layer + pinned
  basemap rows — deferred. `typecheck` + `build` clean.
- 2026-07-16: **Part 2 (shared row grid) done.** Centralised the column widths
  as `LEAD_SLOT` / `GLYPH_SLOT` / `KEBAB_SLOT` / `REMOVE_SLOT` constants in
  `LayersPanel.tsx` and applied them to both the data-layer row and the pinned
  basemap row. The basemap row now renders empty spacers for the missing
  symbology-glyph and X-remove columns, so its leading icon + name line up with
  data-layer rows and its ⋮ lands in the same column as theirs (the always-space
  `opacity-0` X slot is what fixes the kebab x-position). Future pinned rows
  reuse the same constants. `typecheck` + `build` clean. Only the preview
  eyeball (touch scroll + visual alignment on a phone) remains before → done.
