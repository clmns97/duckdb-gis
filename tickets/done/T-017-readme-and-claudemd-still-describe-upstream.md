---
id: T-017
title: README (and parts of CLAUDE.md) still describe upstream duckdb-ui, not the GIS fork
status: done
priority: P2
area: docs
depends_on: [T-014]
branch:
---

## Goal

`README.md` should describe *this* project — a browser-served GIS tool built on
DuckDB with a MapLibre frontend — not the upstream `duckdb/duckdb-ui` it was
forked from. Today the README is the verbatim upstream doc and actively
misleads: wrong title, no mention of the GIS frontend, and commands that no
longer work. Done means a new reader understands what the repo is and can
actually run it.

## Context

<context>
`README.md` is unmodified upstream `duckdb-ui`:
- `README.md:1` title "DuckDB UI Extension"; `:3` "a browser-based user
  interface"; `:7` "most of the user interface code is not yet publicly
  available" — none of this reflects the fork.
- `README.md:41` `call start_ui();` and `:36` `./build/release/duckdb -ui`
  reference the pre-rename verbs (see T-014; `start_ui` is being renamed to
  `start_gis`).
- `README.md:54-58` describes the server proxying UI assets from
  `https://ui.duckdb.org` — our fork serves its own MapLibre `frontend/`
  instead.

This directly contradicts `CLAUDE.md`, which correctly describes the fork,
the QGIS-inspired vision, and the `frontend/` structure.

`CLAUDE.md` itself has one stale line worth correcting while here: the "Project
context" section says frontend dev "historically used `bun --bun`, ports
8080/8443". The actual dev setup is Vite + pnpm on port 5173 (see
`frontend/vite.config.ts:19-20`, `frontend/package.json` scripts). Either
update that note or drop it.

### Suggested remediation
Rewrite `README.md` to describe duckdb-gis: what it is (QGIS-like GIS on a
native/local DuckDB engine, browser-served), how to build (`make`), how to run
the extension + the `frontend/` dev server, and the correct launch verbs after
T-014 lands. Keep the architecture overview but correct the asset-serving
description. Fix the `CLAUDE.md` bun/ports line.
</context>

## Acceptance criteria

- [x] `README.md` describes duckdb-gis (title, purpose, MapLibre frontend), not
      upstream duckdb-ui.
- [x] Launch/verb instructions match the shipped function names (post-T-014).
- [x] The asset-serving description reflects that we serve our own frontend.
- [x] `CLAUDE.md`'s stale `bun`/8080/8443 note is corrected or removed.

## Progress log

- 2026-07-10: Filed by T-013 audit.
- 2026-07-10: Rewrote `README.md` from the verbatim upstream duckdb-ui doc into a
  duckdb-gis README: new title/purpose, MapLibre+deck.gl frontend, repo layout,
  `make` build, the `gis` launch verbs plus the `start_ui`-alias explanation
  (ties to T-014), a Frontend-development section (Vite + pnpm on 5173 proxying
  to `:4213`), and an Architecture section corrected to say we serve our own
  frontend via `ui_remote_url` rather than proxying `ui.duckdb.org`. Fixed the
  stale `CLAUDE.md` "Project context" line (`bun`/8080/8443 → Vite+pnpm/5173).
  README is tracked, so it will get its own commit; CLAUDE.md is untracked and
  lands with the T-015 import. Done.
