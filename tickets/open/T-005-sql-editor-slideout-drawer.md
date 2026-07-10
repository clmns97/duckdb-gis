---
id: T-005
title: Move the SQL editor into a slide-out side drawer with a vertical tab handle
status: open
priority: P2
area: frontend
depends_on: []
branch:
---

## Goal

Stop docking the SQL editor permanently at the bottom. Instead, make it a
**slide-out drawer** on the side of the window, opened/closed by a **vertical
tab handle** (a "bookmark"-style pull tab on the edge). Collapsed by default so
the map gets the full canvas; clicking the tab slides the editor out, clicking
again slides it away. QGIS uses exactly this pattern for its collapsible docks —
vertical tab labels pinned to the window edge.

## Context

<context>
UX reference / vocabulary: this is a **drawer** (a.k.a. flyout / slide-out
panel) with a **pull-tab handle** — like QGIS's collapsible side panels whose
vertical tab sits on the window edge and expands the panel on click.

Current state — `frontend/src/components/EditorPanel.tsx` + `App.tsx`:
  - `App.tsx` renders `<EditorPanel />` as the last child of
    `<main className="canvas">` (~line 134), so it's docked **below** the map.
  - `EditorPanel` is a CodeMirror editor (`basicSetup`, `sql({ dialect:
    PostgreSQL })`, a run keymap; `EditorPanel.tsx` line 13+) that runs the
    query via `renderGeoArrow(text)` (`../lib/deckRender`) and shows a status
    line.
  - CSS: `.canvas` is a vertical flex column and `.editor-panel` is a fixed
    `height: 220px` bottom panel (`frontend/src/App.css` ~line 168–243, incl.
    `.editor-panel`, `.editor-toolbar`, `.editor-host .cm-editor`). Design
    tokens in `frontend/src/lib/tokens.css`.

What changes: relayout so the editor is an overlay/drawer on the side rather
than a bottom flex child, add the vertical tab handle + open/close state, and
the slide transition. The editor's *behavior* (CodeMirror + run) stays the
same — this is presentation/placement, not a rewrite of the editor.

Open design points (pick and note in Progress log):
  - Which side — left (near the catalog) or right? Right keeps it away from the
    Layers/Browser sidebar (T-002). Recommend right.
  - Overlay the map vs. push the map narrower when open. Recommend overlay with
    a subtle shadow (map keeps full size).
  - Resizable width? Optional for v1; a sensible fixed/max width is fine.
  - Remember open/closed + width across reloads? Nice-to-have, not required.
</context>

## Acceptance criteria

- [ ] Editor is no longer a permanent bottom panel; default state is collapsed.
- [ ] A vertical "bookmark" tab handle on the window edge toggles the drawer
      open/closed, with a slide transition. Open/closed state is clear.
- [ ] When open, the full CodeMirror SQL editor + Run behavior work exactly as
      today (run via button and keymap, status line, `renderGeoArrow`).
- [ ] Map canvas gets full height when the drawer is closed.
- [ ] Side + overlay-vs-push decisions applied and noted in Progress log.
- [ ] Frontend build/lint passes; looks right in light and dark (`tokens.css`).

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Sets up the surface that [[T-006]]
  (SQL notebooks) will later live in.
