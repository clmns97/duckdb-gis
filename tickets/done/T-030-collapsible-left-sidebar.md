---
id: T-030
title: Make the left sidebar (Layers / Browser) collapsible
status: done
priority: P2
area: frontend
depends_on: []
branch: t-025-draw-edit-geometry
---

## Goal

Let the user collapse the left sidebar (the Layers / Browser panel) to give the
map the full width, and expand it again — the way the upstream duckdb-ui does it.
Today the sidebar is a fixed-width `aside` that's always shown.

## Context

<context>
UX reference: the **upstream `duckdb/duckdb-ui`** (the fork parent) already has a
collapsible side panel — pull the interaction/affordance from there rather than
inventing one. (Reference only; don't grep the whole `duckdb/` submodule by
default — look at upstream's frontend panel/collapse code specifically.)

Current sidebar — `frontend/src/App.tsx:175`: a fixed
`<aside className="w-[300px] shrink-0 border-r … flex flex-col">` containing the
scrollable panel body and, pinned at the bottom, the Layers/Browser tab strip
(`SidebarTab`, ~line 327). The map lives in `<main>` → `<Dock />` (line ~306).

Scope: a collapse/expand control (toggle button and/or a draggable divider) that
hides the sidebar body and reclaims the space for the map, with the state
persisted for the session. Keep it consistent with the existing tab strip and
the docking work ([[T-005]] `Dock`) — check whether the Dock already offers a
panel-collapse primitive worth reusing before adding a bespoke one.

Decisions to record: toggle-only vs. also drag-to-resize; whether collapsing
leaves a thin rail (icons) or hides entirely; where the expand affordance lives
when collapsed; persistence (localStorage vs. session only).
</context>

## Acceptance criteria

- [x] The user can collapse the left sidebar so the map gets the reclaimed width,
      and expand it again.
- [x] There's an obvious affordance to expand it again while collapsed.
- [x] The collapse state persists across reloads (or a decision to keep it
      session-only is recorded).
- [x] Layers/Browser tab switching and all panel contents work unchanged when
      expanded.
- [x] Consistent with the existing tab strip / Dock styling; works with the
      current Tailwind utility approach.
- [x] Frontend build + typecheck pass.

## Progress log

- 2026-07-14: Ticket created from user feedback — wants the left panel
  collapsible like upstream duckdb-ui. Pull the pattern from the upstream fork
  parent; check the [[T-005]] Dock for a reusable collapse primitive first.
- 2026-07-14: Implemented in `frontend/src/App.tsx`. Decisions recorded:
  **toggle-only** (no drag-to-resize for v1); collapse to a **thin ~40px rail**
  (not fully hidden) so the expand affordance is always on screen; persistence
  via **localStorage** (`gis.sidebar.collapsed`), read lazily in the `useState`
  initializer and written in an effect. The `Dock` (T-005) offers only dockview's
  group splitters — no app-level collapse primitive worth reusing — so the aside
  owns its own collapse. Collapsed rail shows an expand chevron plus a `RailTab`
  per panel (Layers/Browser) that expands and brings that panel forward in one
  click; a `«` collapse button lives at the end of the expanded tab strip.
  `<main>`/`<Dock>` already `flex-1`, so it reflows into the reclaimed width with
  no extra work. `pnpm build` + `tsc --noEmit` pass.
