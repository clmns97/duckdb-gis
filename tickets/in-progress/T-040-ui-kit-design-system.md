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
- 2026-07-18: Fidelity pass vs. freshly-extracted DuckDB UI tokens (`design-reference/artifacts/design-tokens.json`). Extraction validated palette/type/weights/line-height exactly, but flagged two gaps: DuckDB UI is flatter (borderRadius 0px×176 / 6px×7 / 2px×2 — **4px never appears**) and uses **no box-shadows** (`boxShadow: []`), while visible borders are `rgba(0,0,0,0.2)`. Applied (user-approved, all three): (1) `rounded-md`(4px)→`rounded-sm`(2px) across kit components + App.tsx shell + Modal story (coherence); (2) dropped `shadow-md`/`shadow-sm` from menus/modal/toolbar/chip; (3) `--color-hairline` 0.1→0.2. Verified: frontend typecheck+build clean, kit rebuilds, compiled `dist/styles.css` now emits only `.rounded-sm`/`.rounded-lg` (no `.rounded-md`), zero `.shadow-*` utilities, hairline 0.2.
- 2026-07-18: **Re-push to claude.ai/design blocked in this session** — the `/design-sync` skill and its converter (authors per-component `.jsx`/`.d.ts`/`.prompt.md`, compiles `_ds_bundle.css`, grades previews) aren't installed here; only the low-level `DesignSync` upload tool is. A CSS-only manual push would desync the remote's stale `.jsx` (still `rounded-md`) from a bundle that no longer emits `.rounded-md` (→ 0px corners), so it was NOT attempted. Local sync inputs are rebuilt and correct; run `/design-sync` in an interactive session (project `duckdb-gis UI Kit`, `796b4a52-…`) to regenerate + upload the changed component files together.
- 2026-07-18: **GIS-component redesign → QGIS icon tools** (per claude.ai/design handoff `GIS Components (corrected).dc.html`). Rewrote the three GIS presentational views in `frontend/src`:
  - `DrawToolbarView` — replaced the text-label row with a segmented icon toolbar (QGIS digitising bar): 4 bands `[Select] | [Point Line Polygon] | [Delete] | [Commit]` split by 1px gray-200 dividers; 34×34 tool buttons (17px custom stroked icons, active = `bg-subtle`/`text-accent`, hover `bg-gray-100`); Delete ghost→disabled `text-gray-300 not-allowed` when nothing selected, `hover:text-danger` when enabled; Commit is the lone filled button (`bg-success` teal + white check, dirty-count badge `bg-white/[.22]`, busy → spinner + `opacity-70` + "Committing…" + disabled); status line `MODE · N features · M selected` (mono mode); error → inline pill (`text-danger`/`bg-red-50`/`border-red-200` + alert-circle). Line/polygon icons keep white vertex handles (`fill=var(--color-white)`).
  - `SymbologyGlyph` — 12px→16px (fills the 16px `GLYPH_SLOT`, rows still align); point = filled dot + white halo, line = 2px polyline, polygon = filled(28% alpha)+stroked square, loading = dashed gray-300 outline. Still tinted from `style` fill/line.
  - `SelectionChipView` — accent pill: `bg-subtle` + `border-primary-border-active` + `text-accent`, `rounded-full`, cursor glyph + "N selected" + × clear (hover `bg-accent/[.14]`). Dropped the old hardcoded-hex orange square.
  - **Elevation/radius decision (user-asked):** kept the flat fidelity pass — floating overlays get NO shadow, container `rounded-lg` (6px), buttons `rounded-sm` (2px) instead of the handoff's 4px. Consistent with the rest of the app.
  - Added DrawToolbar stories: `WithSelection`, `Busy`, `Error` (+ widened stage). Prop contracts unchanged, so store wrappers (`DrawToolbar`/`SelectionChip`) needed no edits.
  - Verified: frontend + kit typecheck & build clean; `dist/styles.css` emits the new utilities (`w-[34px]`, `bg-subtle`, `text-accent`, `bg-success`, `text-danger`, `border-primary-border-active`, `animate-spin`, alpha `bg-white/[.22]` & `bg-accent/[.14]`), still zero `.rounded-md` / real box-shadows; zero hardcoded hex in the 3 components. Playwright screenshots of all new stories over a served static Storybook render correct.
  - **Still pending (interactive):** `/design-sync` re-run to regenerate `.jsx`/`.prompt.md`/`.html` + `_ds_bundle.*` and push to claude.ai/design — same blocker as the entry above. `dist/` is fresh; sb-reference oracle should be rebuilt by the sync run (needs the font-injection step in `.design-sync/NOTES.md`), so it was intentionally NOT hand-built here.
- 2026-07-18: **`/design-sync` re-sync COMPLETED (interactive) — pushed to claude.ai/design.** Anchored re-sync (project `duckdb-gis UI Kit`, `796b4a52-…`, healthy `_ds_sync.json`). Driver (`resync.mjs`) verdict `ok:true`: `changed` = DrawToolbarView + Modal (story files moved), 6 unchanged carried forward, `canary` reference-drift spot-check on 5. Rebuilt sb-reference + re-injected the brand `@font-face` (NOTES.md re-sync risk). Graded DrawToolbarView (4 stories) + Modal `match` from fresh compare sheets; confirmed the 5 canary sheets (incl. redesigned SelectionChipView) still match. **Conventions drift fixed:** the flat pass tree-shook `--radius-md`, `--color-gray-700`, and all `shadow-sm/md` utilities out of `_ds_bundle.css`; corrected `conventions.md` (radii/elevation/neutrals + input snippet `borderRadius`→`var(--radius-sm)`) and added a NOTES.md re-sync check. Closing driver receipt `ok:true`, `pendingGrade:[]`. Atomic upload: 53 files + anchor last; `list_files` verified; app-created `templates/`/`uploads/` preserved. Durable repo changes this run: `.design-sync/NOTES.md` + `.design-sync/conventions.md`.
