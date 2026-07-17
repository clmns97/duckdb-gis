---
id: T-040
title: UI-kit package + Storybook to prep for design-sync
status: in-progress
priority: P2
area: frontend
depends_on: []
branch: t-040-ui-kit-design-system
---

## Goal

A standalone `design-system/` package that presents the frontend's
isolation-safe presentational components as a proper compiled library plus a
Storybook — reusing `frontend/src` and its `tokens.css` in place (no design
duplication). Two outcomes: a fast per-component iteration loop (no map/DuckDB
boot), and a package a later `/design-sync` run can import cleanly so
claude.ai/design builds new screens out of our real components on our tokens.

## Context

<context>
The frontend (`frontend/`) is a MapLibre GIS **app**, not a component library:
`frontend/dist/` is a single Vite app bundle, there are no library exports and
no stories, and most components are map/DuckDB/dockview-coupled. `/design-sync`
consumes a compiled component library (per-component `dist/`, ideally a
Storybook), so it can't point at this repo as-is (see the design-sync attempt
that was skipped — this ticket is the prep).

Design decisions (locked with the user):
- Storybook included now (fast loop + higher-fidelity sync).
- Source of truth stays in `frontend/src`; the kit imports it in place by
  relative path. Frontend imports/call sites unchanged.
- Scope: 6 clean primitives + the 2 store-coupled ones adapted to prop-driven
  views.

Isolation-safe components and their deps:
- `Button.tsx` — pure (React only).
- `Modal.tsx` (`Modal`, `FieldLabel`, `ModalNote`) — depends only on `Button`.
- `ContextMenu.tsx` (+ `MenuItem`/`MenuState`) — React + lucide-react.
- `TypeGlyph.tsx` — lucide + pure `../lib/columnTypes` (`typeKind`, `TypeKind`).
- `SymbologyGlyph.tsx` — **type-only** import from `../lib/layers`
  (`import type` elided at build → the runtime `layers.ts` graph, which pulls
  `./duckdb` + `./mapBus`, is never loaded).
- `OvertureLogo.tsx` — pure, no imports.
- `SelectionChip.tsx`, `DrawToolbar.tsx` — read runtime stores
  (`../lib/selection`, `../lib/editing`); split into a prop-driven `*View` +
  the existing store-connected container (call sites untouched).

Tokens live at `frontend/src/lib/tokens.css` (Tailwind v4 `@theme` + `:root`
semantic aliases). Frontend uses `@tailwindcss/vite`, React 19, Vite 8. No root
pnpm workspace — `frontend/` is a standalone pnpm package; the kit is too.

Full plan: /home/clemens/.claude/plans/mighty-snacking-cray.md
</context>

## Acceptance criteria

- [x] `design-system/` package builds a library `dist/` (`index.js`, `index.d.ts`, `styles.css`).
- [x] Storybook builds with one story per exported component, all rendering styled (tokens applied).
- [x] `SelectionChipView` / `DrawToolbarView` extracted; app-rendered `SelectionChip`/`DrawToolbar` behavior unchanged.
- [x] `dist/styles.css` contains the component utilities (`bg-primary`, `text-gray-500`, `rounded-md`, `border-hairline`, …).
- [x] Frontend regression clean: `pnpm -C frontend typecheck` + `pnpm -C frontend build` pass.

## Follow-ups (out of this ticket)

- Run `/design-sync` against `design-system/` — creates `.design-sync/` +
  authors `conventions.md` (validated against the built kit). This ticket only
  produces the package the sync consumes.
- Optional: adapt more panel chrome (LayersPanel/LayerProperties/EditorPanel
  rows) into prop-driven views if we want them in Claude Design too.

## Progress log

<!-- Append newest entries at the bottom. Each: what changed, what's next,
     any blocker. This is what makes a token reset survivable. -->
- 2026-07-17: Ticket opened, branch `t-040-ui-kit-design-system` created off main. Scaffolding the package next.
- 2026-07-17: main was 26 commits behind t-034 (held the Tailwind migration the kit needs); fast-forwarded main to t-034 (user asked), re-based this branch on it.
- 2026-07-17: Scaffolded `design-system/` (own pnpm pkg, Storybook + tsup + Tailwind CLI). Exposed 8 components via `src/index.ts` re-exporting `../frontend/src` in place. Split store-connected `SelectionChip`/`DrawToolbar` into store-free `*View` files (`SelectionChipView.tsx`, `DrawToolbarView.tsx`) so the kit bundle no longer drags the map/deck/terra-draw graph (447 KB → 24 KB). One story per component.
- 2026-07-17: Verified — kit typecheck + `pnpm build` (dist js/dts/css) clean; `dist/styles.css` carries the component utilities + tokens; static Storybook builds all 8 stories; Playwright screenshots of Button/ContextMenu/TypeGlyph/SymbologyGlyph/DrawToolbar/Modal all render styled. Frontend `typecheck` + `build` pass (no regression). Ready for a `/design-sync` run.
