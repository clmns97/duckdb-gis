---
id: T-005
title: Dockable workspace — SQL editor (and future attribute tables) as dock panels
status: in-progress
priority: P2
area: frontend
depends_on: []
branch: t-002-sidebar-tabs
---

## Goal

Stop docking the SQL editor as a permanent fixed pane. The map and the SQL
editor become **dock panels** in a real docking workspace: the map fills the
canvas, the editor docks **below** it by default, and either can be dragged into
the other's group, tabbed, floated, split, or collapsed via the group splitters —
the QGIS-style "reclaim the space" pattern. Done means: the editor's CodeMirror +
Run behavior is unchanged, but it now lives in a movable/collapsible dock tab, the
map gets the full canvas when the editor group is collapsed, and the surface is
ready for attribute tables to open as additional tabs (T-026).

## Context

<context>
Re-scoped from the original "right-side slide-out drawer" after user feedback:
they want the editor at the **bottom**, collapsible, and sharing a **tabbed**
surface with future attribute tables — and ideally **dockable** (drag a panel
over the map, tab between map / attribute tables). Two decisions confirmed:
1. Adopt a real docking library now (not a hand-rolled pane).
2. This ticket delivers the dock shell + SQL editor only; the working attribute
   table is a separate ticket (T-026).

Library: **dockview** `^6.6.1` (`frontend/package.json`). NOTE: dockview 7.x is
core-only and its React bindings (`dockview-react`) currently fail to install
(unpublished `dockview-modules` dep) — 6.x bundles `DockviewReact` in the
`dockview` package and supports React 19. Stay on 6.x until 7.x is fixed.

Implementation:
- `frontend/src/components/Dock.tsx` — `DockviewReact` with components
  `{ map, editor }`; `onReady` adds the `map` panel then the `editor` panel with
  `position: { referencePanel: "map", direction: "below" }`. `defaultRenderer:
  "always"` keeps every panel's DOM mounted (hidden, not detached, when inactive)
  so the live MapLibre map and CodeMirror editor survive tab switches / re-docking.
  Imports `dockview/dist/styles/dockview.css`; className `dock-root
  dockview-theme-light`.
- `frontend/src/components/panels/MapPanel.tsx` — renders
  `.map-wrap` (MapView + SelectionChip) and calls `getMap()?.resize()`
  (`lib/mapBus`) on `props.api.onDidDimensionsChange` so MapLibre re-measures
  after a splitter drag / re-dock (otherwise it renders at a stale size).
- `frontend/src/App.tsx` — `<main className="canvas">` now renders just `<Dock/>`.
- `frontend/src/App.css` — `.dock-root` fills the canvas; `.map-wrap` and
  `.editor-panel` fill their dock panels (was fixed `height:220px`); a
  `.dock-root { --dv-*: ... }` block maps dockview's theme vars onto `tokens.css`
  and gives the active tab the same indigo underline as the sidebar tabs.
- The deck.gl overlay is a MapLibre control (`lib/deckRender.ts`), so it follows
  the re-parented map with no extra work.

Collapse + drag-resize come free from dockview's group splitters — no bespoke code.
</context>

## Acceptance criteria

- [x] Editor is no longer a permanent fixed bottom pane; it's a dock panel that
      can be collapsed (map gets full canvas) and moved/tabbed.
- [x] Map and editor are dock panels; editor docks below the map by default.
- [x] When open, the CodeMirror SQL editor + Run behavior work exactly as today
      (editor mounts, Run button + keymap wired; `EditorPanel` unchanged — live
      query still needs the :4213 backend, unaffected by the relocation).
- [x] Map resizes correctly (verified: canvas persists and tracks viewport on
      resize). Drag-to-tab/float/collapse are stock dockview group behavior.
- [x] Frontend build + typecheck pass; theme reads correctly against `tokens.css`.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started.
- 2026-07-13: Re-scoped from right-side drawer to a dockable workspace (user
  feedback). Decisions: real docking library now; dock shell + SQL editor only
  (attribute table split to T-026). Implemented with dockview 6.6.1 —
  `Dock.tsx` + `panels/MapPanel.tsx`, `App.tsx`/`App.css` rewired; map & editor
  are dock panels, editor below map, `defaultRenderer:"always"` keeps them alive
  across re-dock, `onDidDimensionsChange`→`map.resize()`. typecheck + build green.
  Verified headless (Playwright vs. Vite dev): both dock tabs render
  ("Map" / "SQL Editor"), map canvas lives in its panel (map-dominant default,
  ~205px editor below), active tab shows the indigo underline, and the map canvas
  persists + resizes with the viewport (980→600 on shrink). CodeMirror + Run
  button present. Next: commit (note: working tree also has in-progress T-007
  attach changes in App.tsx/App.css).
