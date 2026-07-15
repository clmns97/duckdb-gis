---
id: T-033
title: Switchable basemaps (OSM / CARTO / ESRI)
status: done           # open | in-progress | blocked | done
priority: P2           # P0 (now) | P1 | P2 | P3
area: frontend         # frontend | src (C++) | ts | build | docs
depends_on: []         # other ticket ids, e.g. [T-001]
branch: t-033-t-004-basemaps-processing
---

## Goal

The user can switch the map's basemap between several well-known providers
(OpenStreetMap, CARTO, ESRI — QuickMapServices-style). The current basemap
appears in two places: a **Basemap entry in the Browser pane** (like the
"Overture Maps" quick-load button), and a **fixed row pinned to the bottom of
the Layers panel** (below all data layers, never reorderable). From either
place the user picks a different basemap — via the Browser entry's menu, or by
right-clicking the pinned Layers row and choosing **"Change Basemap"** — and the
map redraws with the chosen tiles while all data layers stay on top.

## Context

<context>
Today the basemap is a single hardcoded MapLibre style
(`frontend/src/components/MapView.tsx:15`,
`style: "https://demotiles.maplibre.org/style.json"`) set once when the map is
constructed. There is no basemap concept anywhere in the UI or state.

Reference implementations to mirror:

- **Overture Maps entry** in the Browser pane: `frontend/src/App.tsx:241-251`
  — a full-width button with an icon glyph (`◈`), a label, and a trailing hint
  (`quick load…`). The Basemap entry should look and sit similarly (Browser
  pane is the `tab === "browser"` branch, `frontend/src/App.tsx:239-340`).
- **OvertureModal** (`frontend/src/components/OvertureModal.tsx`, opened from
  `App.tsx:376-378`) is the pattern for a picker dialog if we go the modal
  route for basemap selection. `Modal.tsx` is the shared shell.
- **Layers panel rows** live in `frontend/src/components/LayersPanel.tsx`. Data
  layers are drag-reorderable (T-031). The basemap row must be **pinned at the
  bottom, non-draggable, and not part of the `layers` store's reorderable
  list** — render it as a separate fixed row after the `<ul>` (or in App.tsx
  just below `<LayersPanel/>` at `App.tsx:237`). Right-clicking it opens a
  context menu with a **"Change Basemap"** item.
- **Context menu**: `frontend/src/components/ContextMenu.tsx`. NOTE: `MenuItem`
  is currently **flat** — `{ label, onSelect, disabled? }`
  (`ContextMenu.tsx:8-11`), with no nested/submenu support. **Decision (chosen):
  add submenu support to `ContextMenu`** — an optional `children?: MenuItem[]`
  that renders a flyout on hover, so the user hovers "Change Basemap" and the
  provider list opens beside it without a modal / large mouse travel (this is
  the QuickMapServices feel the user wants). Explicitly **not** a modal — the
  point is to minimize mouse movement. The submenu should:
  - open to the right of the parent item on hover (flip to the left if it would
    overflow the viewport, mirroring the existing off-screen handling in
    `ContextMenu`);
  - close when the pointer leaves both parent and flyout;
  - support the same `disabled` semantics and a way to mark the active basemap
    (e.g. a leading ✓ on the current one).
  Group the provider entries by vendor in the submenu (OSM / CARTO / ESRI). If
  a single flat flyout gets long, use non-selectable section headers or nested
  `children` per vendor (OSM ▸, CARTO ▸, ESRI ▸) — nested children fall out for
  free once `ContextMenu` supports one level of submenu.
- **Browser-pane entry trigger**: the Browser "Basemap" button must open the
  *same* submenu of providers. Since it isn't a right-click context menu,
  either reuse `ContextMenu` anchored to the button's rect (open on click), or
  render an inline expanding list under the button. Prefer reusing the
  `ContextMenu` component so there is one basemap-menu definition shared by both
  surfaces.
- **Map access**: the single map instance is reachable via
  `getMap()` / `setMap()` in `frontend/src/lib/mapBus.ts`. Switching a basemap
  means swapping the raster source/style layer *underneath* the data layers.

Basemap-switching approach (important MapLibre gotcha): calling
`map.setStyle(newStyle)` **wipes all sources/layers**, including our data
layers, deck.gl overlay, and MVT sources. Prefer adding the basemap as a
**raster source + a single raster layer inserted at the bottom** of the current
style (below every data layer), and switch basemaps by removing/re-adding that
one raster source+layer — this leaves data layers untouched. The initial map
style can be a minimal empty style (`{ version: 8, sources: {}, layers: [] }`)
plus the default basemap's raster layer, instead of the demotiles style.

Suggested basemap catalog (all XYZ raster, no API key required — match
QuickMapServices' common defaults):

- **OSM Standard** — `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  (attribution: © OpenStreetMap contributors)
- **CARTO Positron (light)** —
  `https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- **CARTO Dark Matter** —
  `https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **CARTO Voyager** —
  `https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`
- **ESRI World Imagery (satellite)** —
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- **ESRI World Street Map** —
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}`
- **None** — no basemap (transparent), so data layers show on the app background.

Respect each provider's attribution/tile-usage policy; set `attribution` on
each raster source so MapLibre's attribution control shows it. Keep the catalog
in a small module (e.g. `frontend/src/lib/basemaps.ts`) as data, so entries are
easy to add. Consider persisting the last-chosen basemap (localStorage) so it
survives reload — nice-to-have, not required for v1.
</context>

## Acceptance criteria

- [ ] A **Basemap** entry appears in the Browser pane, styled like the Overture
      Maps button, showing the current basemap name.
- [ ] A **fixed basemap row is pinned at the bottom of the Layers panel**, below
      all data layers; it is not draggable and cannot be reordered above data
      layers.
- [ ] **Right-clicking the pinned Layers row** shows a **"Change Basemap"**
      option that **expands into a submenu (flyout)** of providers on hover — no
      modal, minimal mouse travel.
- [ ] The **Browser entry** opens the **same provider submenu**.
- [ ] The submenu offers basemaps grouped/labeled by provider — **OSM, CARTO,
      ESRI** (plus a "None" option), QuickMapServices-style, with the active
      basemap marked.
- [ ] `ContextMenu` gains reusable one-level **submenu support** (`children`),
      used by both surfaces; the flyout flips side to stay on-screen.
- [ ] Selecting a basemap **switches the displayed tiles** and **all data layers
      remain rendered on top** (data layers are not wiped — see the
      `setStyle` gotcha in Context).
- [ ] Attribution for the active basemap shows in the map's attribution control.
- [ ] Both UI locations reflect the currently-active basemap (name/checkmark).
- [ ] Build passes (`make` for the extension is unaffected; `pnpm build` in
      `frontend/` typechecks/builds the UI).

## Progress log

<!-- Append newest entries at the bottom. Each: what changed, what's next,
     any blocker. This is what makes a token reset survivable. -->
- 2026-07-15: Ticket created. Scope: basemap-switching UI in Browser pane +
  pinned Layers row, provider catalog (OSM/CARTO/ESRI), swap via raster
  source/layer at bottom of style to avoid wiping data layers.
- 2026-07-15: Decision settled — use a **submenu/flyout in `ContextMenu`**, not
  a modal, so the provider list opens on hover with minimal mouse travel
  (QuickMapServices feel). Both the pinned Layers row and the Browser entry
  reuse the same shared basemap submenu. Requires adding one-level `children`
  submenu support to `ContextMenu`.
- 2026-07-16: **Implemented and done.** New `frontend/src/lib/basemaps.ts`:
  provider catalog (OSM / CARTO Positron·Dark·Voyager / ESRI Imagery·Street /
  None) as data, a tiny subscribe/notify store (`basemap`, persisted to
  `localStorage` `gis.basemap.id`, default CARTO Positron), an `applyBasemap`
  swap that removes/re-adds a single `gis-basemap` raster source+layer inserted
  **below** the first style layer (never `setStyle` — data layers untouched),
  and a shared `basemapMenuItems()` (grouped by vendor via section headers, ✓ on
  active). `MapView.tsx` now starts from an empty style `{version:8,...}` and
  calls `basemap.applyInitial(map)`. `ContextMenu.tsx` gained `children`
  (hover flyout, flips left near the right edge), `header` (section labels),
  `checked` (✓), and root-menu viewport clamping. Surfaces: a **Basemap** entry
  in the Browser pane (shows active name, opens the shared submenu) and a
  **pinned, non-draggable basemap row** at the bottom of `LayersPanel` (below all
  data layers; right-click → "Change Basemap" flyout). Attribution set per source
  → shows in the compact attribution control. Verified: `pnpm typecheck` +
  `pnpm build` clean; headless Playwright drive (Vite dev) confirmed the Browser
  entry (default "Positron (light)" → "Standard" after picking OSM, i.e. swap +
  reflection + persistence), the grouped menu with ✓, the pinned row, and the
  right-click "Change Basemap" hover flyout — zero console/page errors. Live tile
  pixels not asserted headless, but the swap code path ran clean.
