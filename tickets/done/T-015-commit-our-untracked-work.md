---
id: T-015
title: Get our work under version control (frontend/spike/tickets untracked)
status: done
priority: P1
area: build
depends_on: [T-014]
branch:
---

## Goal

All of our first-party work should be committed to git with a sensible
`.gitignore`. Today the entire point of the fork — the MapLibre `frontend/` —
plus `spike/`, `design-reference/`, `testdata/`, `tickets/`, and `CLAUDE.md`
are **untracked**, and `src/ui_extension.cpp` has uncommitted edits. That is a
data-loss and collaboration risk: none of it survives a fresh clone, and there
is no history for the pivots. Done means these are committed (or deliberately
git-ignored) so a clean checkout reproduces the project.

## Context

<context>
`git status` on `main` shows:

```
 M src/ui_extension.cpp          # the start_gis rename — see T-014
?? CLAUDE.md
?? design-reference/
?? frontend/                     # the whole GIS frontend — the fork's raison d'être
?? spike/
?? testdata/
?? tickets/
```

Nothing under `frontend/`, `spike/`, `tickets/`, etc. is in git. The last
commits (`git log`) are all upstream/build-plumbing fixes; none of our GIS work
is recorded.

### What to commit vs ignore
- **Commit:** `frontend/src`, `frontend/*.config.*`, `frontend/package.json`,
  `frontend/pnpm-lock.yaml`, `frontend/index.html`, the e2e `.mjs` scripts,
  `ts/` (already tracked), `tickets/`, `CLAUDE.md`, `testdata/{seed.sql,
  build.sh,serve.sh,README.md}`.
- **Ignore (do not commit):** `node_modules/`, `dist/`, generated screenshots
  (see T-018), `testdata/demo.duckdb` (already ignored via
  `testdata/.gitignore`), any `*.duckdb`/WAL fixtures.
- **Decide:** whether `design-reference/` (design assets + `duckgl/` reference
  + its own `node_modules`) and `spike/` belong in the repo, in a separate
  branch, or ignored. They are prototypes/reference, not production
  (`CLAUDE.md` calls `spike/` "not production").

### Gotchas
- The e2e scripts import Playwright from
  `../design-reference/node_modules/playwright` (see T-018) — committing
  `frontend/` without resolving that leaves them broken on a clean clone.
- Commit the `src/ui_extension.cpp` change only after T-014 is resolved (the
  rename currently breaks `-ui`).
- This ticket only asks to *version-control* the work — it must not be used to
  paper over the individual debt tickets (T-014, T-016..T-020).
</context>

## Acceptance criteria

- [x] A fresh `git clone` + `pnpm install` reproduces a runnable `frontend/`.
- [x] `node_modules/`, `dist/`, and generated artifacts are git-ignored, not
      committed.
- [x] A conscious decision recorded (commit / branch / ignore) for
      `design-reference/` and `spike/`.
- [x] `git status` is clean (no stray untracked first-party dirs).

## Progress log

- 2026-07-10: Filed by T-013 audit. All first-party dirs untracked on `main`;
  `src/ui_extension.cpp` modified but uncommitted.
- 2026-07-10: Worked alongside T-014/16/17/18/19/20 so the import lands clean.
  DECISIONS (per repo owner): (1) `design-reference/` and `spike/` are
  git-ignored — kept locally only (spike/ is non-production; design-reference/
  carries 19 MB of captures + its own node_modules). Added `design-reference/`
  and `spike/` to the root `.gitignore`. (2) Committed directly to `main` with
  per-ticket commits rather than per-ticket branches/PRs, since nothing
  first-party was in git yet (bootstrapping an untracked tree).
  Committed already (tracked files, own commits): `src/ui_extension.cpp`
  (T-014), `README.md`+`CLAUDE.md` (T-017), `test/sql/ui.test` (T-020).
  This import commit adds the remaining first-party work: `frontend/` (22 files;
  node_modules/dist/*.png ignored via `frontend/.gitignore`, so a clean clone +
  `pnpm install` reproduces it — the frontend enters git already reflecting the
  T-016/18/19 cleanups), `testdata/` (build.sh/seed.sql/serve.sh/README/.gitignore;
  generated `demo.duckdb` stays ignored), `tickets/`, and the `.gitignore`
  update. Verified via `git add -n` dry-run: no node_modules/dist/png and no
  design-reference/spike staged. Done.
