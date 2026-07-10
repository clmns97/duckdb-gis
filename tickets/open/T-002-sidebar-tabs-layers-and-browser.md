---
id: T-002
title: Split the sidebar into two switchable tabs — Layers and Browser
status: open
priority: P2
area: frontend
depends_on: []
branch:
---

## Goal

Reorganize the sidebar into two tabbed panels the user can switch between,
mirroring QGIS's docked panels:

- **Layers** — the map layers currently added to the view (styling, order,
  visibility live here). QGIS calls this the *Layers panel*.
- **Browser** — the database/catalog tree (attached databases › schemas ›
  tables) for exploring and adding data. QGIS calls this the *Browser panel*.

Only one panel is visible at a time; a tab strip at the top of the sidebar
switches between them. This declutters the sidebar (today both stack
vertically) and gives each panel the full height.

## Context

<context>
UX reference (the vocabulary the user was reaching for): QGIS docks its
*Layers panel* and *Browser panel* as **tabs** on the same side; clicking a
tab brings that panel forward. We want the same two-tab switch, not the
current stacked layout.

Current state — everything lives in one `<aside className="sidebar">` in
`frontend/src/App.tsx` (~line 61), stacked as two `<section className=
"tree-section">` blocks:
  - "Layers" section, ~line 70–78 (currently hardcoded "No layers yet"; will
    be populated by geometry-layer detection — see [[T-001]]).
  - "Attached databases" section (the catalog tree), ~line 80–127, driven by
    `databases` state from `loadCatalog()` (`frontend/src/lib/catalog.ts`).
  - A "Search" input sits above both (~line 62–68) — decide whether it stays
    global (above the tabs) or moves into the Browser tab. Recommend: keep it
    with the Browser tab, since it searches the catalog.

Styling: `frontend/src/App.css` (`.sidebar` ~line 63, `.section-head`
~line 93, `.tree*` classes) and design tokens in
`frontend/src/lib/tokens.css`. No tab component exists yet — add one.

Scope note: this is a **layout/structure** change. It should not change how
layers are detected (T-001) or how the catalog is queried — just how the two
panels are presented and switched.
</context>

## Acceptance criteria

- [ ] Sidebar shows a tab strip with two tabs: **Layers** and **Browser**.
- [ ] Clicking a tab switches which panel is shown; the other is hidden. Active
      tab is visually indicated. One panel visible at a time.
- [ ] **Layers** tab hosts the existing Layers section; **Browser** tab hosts
      the existing attached-databases catalog tree — no loss of current
      functionality (loading / error / empty states preserved).
- [ ] Decision made and applied for the Search input (global vs. Browser-only)
      — record which in the Progress log.
- [ ] Active tab state is component-local; a sensible default tab on load
      (recommend Browser until layers exist, or Layers — pick and note it).
- [ ] Frontend build/lint passes; sidebar renders correctly light and dark if
      the app themes (check `tokens.css`).

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Pairs with T-001 (which populates
  the Layers panel); the two can land independently.
