---
id: T-018
title: Frontend repo hygiene — screenshot artifacts, cross-dir Playwright dep, CSS case collision
status: done
priority: P3
area: frontend
depends_on: []
branch:
---

## Goal

A cluster of small frontend hygiene issues that individually are nits but
together make the tree fragile and confusing on a clean clone / case-insensitive
filesystem. Done means generated artifacts aren't committed, the e2e scripts
resolve their own dependency, and the two case-colliding CSS files are
disambiguated.

## Context

<context>
### 1. Committed screenshot artifacts, not git-ignored
`frontend/.gitignore` only ignores `node_modules/` and `dist/`, so generated
PNGs are trackable:
- `frontend/deck.png` (~680 KB), `frontend/tiles.png` (~2.6 MB) — outputs of the
  e2e `.mjs` scripts.
- `frontend/shot.mjs` writes `shell.png`; `shot-sql.mjs` writes an argv-named
  PNG.
- `spike/override/spike-result.png`, and `design-reference/artifacts/*.png` +
  `design-reference/duckgl/*.png` (design/reference captures).
Add gitignore entries (e.g. `*.png` outputs, or a dedicated `screenshots/` dir)
and/or delete the checked-in ones. Coordinate with T-015 (what gets committed).

### 2. e2e scripts depend on a sibling dir's node_modules
`frontend/shot.mjs`, `shot-sql.mjs`, `tile-check.mjs`, `bench.mjs`, and
`spike/check.mjs` all do:
`import { chromium } from "../design-reference/node_modules/playwright/index.mjs";`
Playwright is **not** a declared devDependency of `frontend/` — the scripts
reach into `design-reference/`'s `node_modules`. On a clean clone (or if
`design-reference/` is dropped per T-015) they break. Fix: add `playwright` (or
`@playwright/test`) as a `frontend` devDependency and import it normally;
optionally move the scripts into `frontend/scripts/` or `frontend/e2e/`.

### 3. `App.css` vs `app.css` collide on case-insensitive filesystems
`frontend/src/App.css` (component styles, imported by `App.tsx:2`) and
`frontend/src/app.css` (global reset + tokens import, imported by
`main.tsx:3`) differ only in case. On macOS/Windows default filesystems these
two files cannot coexist in a checkout — one silently wins, breaking styles.
Both are real and used; rename the global one to an unambiguous name
(e.g. `index.css` or `global.css`) and update the `main.tsx` import.
</context>

## Acceptance criteria

- [x] Generated screenshots are git-ignored and/or removed; none are committed.
- [x] e2e `.mjs` scripts import Playwright from a declared dependency and run on
      a clean `pnpm install` in `frontend/`.
- [x] No two source files differ only by case; `pnpm --dir frontend typecheck`
      and a dev build still work.

## Progress log

- 2026-07-10: Filed by T-013 audit.
- 2026-07-10: Scoped to frontend-only per T-018 brief (spike/design-reference
  handled by T-015; package.json dep pruning is T-019; bench.mjs already deleted
  by T-016).
  - Screenshots: added `*.png` to `frontend/.gitignore`; `rm`'d the generated
    `frontend/deck.png` and `frontend/tiles.png` (never committed).
  - Playwright: `pnpm add -D playwright` succeeded cleanly (playwright 1.61.1
    added to devDependencies; pnpm-lock.yaml updated). Rewrote the imports in
    `frontend/shot.mjs`, `shot-sql.mjs`, `tile-check.mjs` from the cross-dir
    `../design-reference/node_modules/playwright/index.mjs` to `"playwright"`.
  - CSS collision: `mv frontend/src/app.css frontend/src/global.css`; updated the
    import in `frontend/src/main.tsx` to `./global.css`. Component `App.css` left
    as-is and confirmed still distinct.
  - Verify: `pnpm typecheck` passes; `pnpm build` succeeds (Vite build clean,
    only the pre-existing chunk-size warning). Greps confirm no remaining
    cross-dir playwright import in `frontend/*.mjs` and no `./app.css` import.
  - Done. Commit left to parent (main).
