---
id: T-002
title: Split the sidebar into two switchable tabs — Layers and Browser
status: in-progress
priority: P2
area: frontend
depends_on: []
branch: t-002-sidebar-tabs
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

- [x] Sidebar shows a tab strip with two tabs: **Layers** and **Browser**.
- [x] Clicking a tab switches which panel is shown; the other is hidden. Active
      tab is visually indicated. One panel visible at a time.
- [x] **Layers** tab hosts the existing Layers section; **Browser** tab hosts
      the existing attached-databases catalog tree — no loss of current
      functionality (loading / error / empty states preserved).
- [x] Decision made and applied for the Search input (global vs. Browser-only)
      — record which in the Progress log.
- [x] Active tab state is component-local; a sensible default tab on load
      (recommend Browser until layers exist, or Layers — pick and note it).
- [x] Frontend build/lint passes; sidebar renders correctly light and dark if
      the app themes (check `tokens.css`).

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Pairs with T-001 (which populates
  the Layers panel); the two can land independently.
- 2026-07-10: Implemented on branch `t-002-sidebar-tabs`.
  - `frontend/src/App.tsx`: added a `tab` state (`"layers" | "browser"`) and a
    `.tabs` tab strip (`role="tablist"`, buttons with `role="tab"` +
    `aria-selected`). The Layers section and the Browser section (search +
    attached-databases tree) are now rendered one-at-a-time by `tab`.
  - **Search input decision:** moved *into* the Browser tab (it searches the
    catalog), not kept global. Lives above the attached-databases tree.
  - **Default tab:** Browser — the Layers panel is still the hardcoded
    "No layers yet" until T-001/T-021 populate it, so the catalog is the more
    useful landing panel. Noted inline in `App.tsx`.
  - `frontend/src/App.css`: added `.tabs` / `.tab` / `.tab.active` (active tab
    underlined with `--indigo`). All colors from tokens; app has no dark theme
    yet (tokens.css defines light only), so light is the only surface.
  - Verified: `pnpm typecheck` clean, `pnpm build` succeeds, Vite HMR applied
    live with no errors. Both panels' loading/error/empty states preserved.
  - Next: eyeball on the running preview, then commit + open PR.
- 2026-07-10: Per user, moved the tab strip to the **bottom** of the sidebar
  (footer) instead of the top. Wrapped panels in a scrollable `.sidebar-body`
  (`flex:1; overflow-y:auto`) so the tree scrolls while `.tabs` stays pinned;
  `.tabs` is now a full-bleed footer with the border/active indicator on its
  top edge. typecheck + build pass, HMR clean.
