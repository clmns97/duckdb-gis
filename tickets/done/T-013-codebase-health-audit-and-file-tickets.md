---
id: T-013
title: Audit codebase health / tech debt and file tickets for findings (audit-only)
status: open
priority: P1
area: docs
depends_on: []
branch:
---

## Goal

**For the agent that picks this up:** audit *our* code for health issues, tech
debt, legacy/leftover code, and things that seem out of place, then **file one
ticket per coherent finding** in `tickets/open/`. **Do not fix anything.** Your
only writes to the repo are new ticket files (and moving/annotating this ticket).
The point is a prioritized, actionable map of what needs cleanup — not the
cleanup itself.

Context for why: we worked heavily in this codebase over the last two days and
**pivoted direction several times**, so it is likely less clean and compact than
it should be — expect dead ends, duplication, half-migrated patterns, and
leftover experiments.

## Context

<context>
### Scope — audit ONLY our code
In scope: `src/` (C++ extension), `src/include/`, `src/utils/`, `ts/`,
`frontend/`, `spike/`, `test/`, plus root config (`CMakeLists.txt`, `Makefile`,
`extension_config.cmake`, `vcpkg.json`, `package.json`s).

**Out of scope — do NOT audit or flag (vendored):** `duckdb/`,
`extension-ci-tools/`, `third_party/`, any `node_modules/`, `build/`, `.cache/`.
See `CLAUDE.md` for the orientation ("where the real code is") and the project
vision (replicate QGIS on a native/local DuckDB engine, browser-served).

### What to look for (non-exhaustive)
- **Dead / unreachable code**: unused exports, functions, files, CSS classes,
  TS types; commented-out blocks; unreferenced assets.
- **Leftover experiments / pivots**: `spike/` code that leaked into production
  paths; superseded approaches left alongside their replacements; references to
  the old "Quacklas" prototype or other abandoned directions.
- **Duplication / near-duplication**: copy-pasted logic that should be shared;
  parallel implementations of the same thing.
- **Inconsistency**: divergent patterns for the same job (e.g. error handling,
  query building, state management), naming/style drift, mixed conventions.
- **Stale markers**: `TODO` / `FIXME` / `HACK` / `XXX`, dev seams meant to be
  temporary (e.g. console-driven "dev seam" hooks noted in `frontend/src`),
  stale comments that no longer match the code.
- **Structural smells**: oversized files/functions, tangled responsibilities,
  things living in the wrong module/directory.
- **Build/dep hygiene**: unused dependencies, duplicated/mismatched deps across
  `ts/` packages and `frontend/`, dead build config.
- **Repo hygiene**: uncommitted/untracked work that looks abandoned, files that
  should be gitignored, large committed artifacts. (Note: there is currently a
  modified `src/ui_extension.cpp` and several untracked dirs — assess, don't
  "fix" by committing/reverting.)
- **Test gaps** only where glaring and tied to the above (don't do a full
  coverage audit).

### How to verify (don't guess)
Read the code before flagging. Use grep/search to confirm something is actually
unused across the whole of our code (a symbol may be referenced from `ts/` or
`frontend/` or a dev seam). A false "this is dead" is worse than not flagging.
Rank findings by confidence and only file ones you've actually substantiated;
put genuinely uncertain observations in the summary instead of as tickets.

### How to file findings (the deliverable)
1. **One ticket per coherent finding or tightly-related cluster.** Group
   related nits (e.g. "remove N unused CSS classes") into one ticket; don't
   create dozens of trivially-small tickets. Aim for actionable units.
2. Use `tickets/TEMPLATE.md`. Allocate IDs sequentially **starting after the
   highest existing ticket id** (this ticket is T-013; existing tickets go up
   to T-012, so start your findings at **T-014**). Confirm the current max with:
   `ls tickets/*/ | grep -oE 'T-[0-9]+' | sort -u | tail -1`.
3. Fill each finding ticket properly: concrete **file:line** references, why
   it's a problem, and a suggested remediation in the Goal/Context — enough that
   a cold agent could act on it. Set a sensible `area` and `priority`
   (P1 = actively harmful/misleading, P2 = real debt, P3 = nice-to-have tidy).
4. Put them in `tickets/open/`. Do **not** duplicate existing tickets
   (T-001..T-012) — if a finding overlaps one, note it in that finding instead.
5. **Never modify non-ticket files.** No refactors, no deletions, no "quick
   fixes." Audit-only.

### Wrap-up
When done, record in this ticket's Progress log: a short summary of the codebase
health, the list of finding ticket ids you created (with one-line each), and any
uncertain observations you deliberately did NOT ticket. Then move this ticket to
`tickets/done/`.
</context>

## Acceptance criteria

- [ ] Our code (src/ts/frontend/spike/test/config) reviewed for the categories
      above; vendored dirs untouched and unflagged.
- [ ] Findings filed as well-formed tickets in `tickets/open/`, IDs starting at
      T-014, using the template, with file:line refs, priority, and area.
- [ ] Related findings grouped into coherent tickets (no ticket spam); uncertain
      items summarized rather than ticketed.
- [ ] No code changed anywhere — only new ticket files added (verify
      `git status` shows only additions under `tickets/`).
- [ ] This ticket's Progress log has the health summary + created-ticket list;
      ticket moved to `done/`.

## Progress log

- 2026-07-09: Ticket created for handoff to an auditing agent. Not started.
  Audit-only — creates tickets, fixes nothing.
- 2026-07-10: Audit complete. Filed 7 finding tickets (T-014..T-020). No code
  changed — only ticket files added. Moved to done.

  ### Codebase health summary
  Our code is small (~1.9k lines C++ in `src/`, ~1.4k lines TS in
  `frontend/src`, plus the `ts/` DuckDB client packages) and, where it's the
  chosen path, genuinely clean and well-commented (`deckRender.ts`, `tiles.ts`,
  `http_server.cpp`). The debt is exactly what the pivots predicted:
  superseded prototypes left beside their replacement, stale docs/comments, and
  a big version-control gap. Two P1 issues stand out: (1) an uncommitted rename
  that breaks the documented `duckdb -ui` launch flag, and (2) the entire
  first-party tree — including the whole `frontend/` — is untracked in git.

  ### Finding tickets created
  - **T-014 (P1, src):** the working-tree `start_ui`→`start_gis` rename removes
    the function the core shell's `-ui` flag calls (`CALL start_ui()`), so
    `duckdb -ui` errors. Fix: register both names as aliases.
  - **T-015 (P1, build):** `frontend/`, `spike/`, `design-reference/`,
    `testdata/`, `tickets/`, `CLAUDE.md` all untracked; `src/ui_extension.cpp`
    uncommitted. Commit our work with a proper `.gitignore`.
  - **T-016 (P2, frontend):** superseded GeoJSON/WKB render experiments —
    dead `parseWKB` + helpers in `wkb.ts`, a benchmark harness
    (`bench.ts`/`bench.mjs`), and comments referencing a deleted `render.ts`.
  - **T-017 (P2, docs):** `README.md` is verbatim upstream duckdb-ui (wrong
    title/purpose, dead `start_ui()` command, `ui.duckdb.org` proxy claim);
    plus a stale `bun`/8080-8443 note in `CLAUDE.md`.
  - **T-018 (P3, frontend):** hygiene cluster — committed screenshot PNGs not
    gitignored; e2e `.mjs` scripts import Playwright from a sibling dir's
    `node_modules`; `App.css` vs `app.css` collide on case-insensitive FS.
  - **T-019 (P3, build):** candidate-unused frontend deps (several `@deck.gl/*`,
    `@math.gl/polygon`, `@codemirror/*`) — verify against peer deps before
    removing.
  - **T-020 (P2, src):** `test/sql/ui.test` is a header-only stub; no coverage
    for the gis launch verbs (would have caught T-014).

  ### Deliberately NOT ticketed (uncertain / intentional)
  - The `window.gisTiles` / `window.gisDeck` dev seams in `App.tsx` are
    documented, intentional, and currently the only entry point to `tiles.ts`
    (the ST_AsMVT path). Removing them now would orphan working code; they
    belong with the Layers-UI work already tracked by T-001/T-002/T-010.
  - The `TODO`s in `ts/pkgs/*` and `src/http_server.cpp` are inherited from
    upstream DuckDB code, not our pivot debt — left alone.
  - `spike/` and `design-reference/` are self-contained prototype/reference
    dirs (not leaking into production paths per `CLAUDE.md`); whether to keep
    them is folded into T-015's commit/ignore decision rather than ticketed
    separately.
