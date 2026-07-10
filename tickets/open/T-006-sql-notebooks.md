---
id: T-006
title: SQL notebooks — multi-cell authoring and storage (advanced users)
status: open
priority: P3
area: frontend
depends_on: [T-005]
branch:
---

## Goal

Bring back the **SQL notebook** experience from the original DuckDB UI, as a
power-user feature: the user can author notebooks made of multiple SQL cells,
run cells, and **save/store named notebooks** to return to later. The simple
single-query editor (T-005) stays as the default; notebooks are the richer mode
for advanced users.

## Context

<context>
Motivation: the user specifically likes the SQL-notebook concept from
`duckdb/duckdb-ui` (the project this repo is forked from) and wants it retained
for advanced users, layered on top of the simple editor — not replacing it.

Reference: the upstream duckdb-ui notebook UX (cells of SQL, run per cell,
results inline, named/stored notebooks). This repo is that fork, so upstream is
available under `duckdb/` submodules and the original TS packages under `ts/`
(e.g. `duckdb-ui-client`, `duckdb-data-reader`) may already carry notebook data
models worth reusing — investigate before building from scratch.

Builds on [[T-005]]: notebooks live in the same slide-out editor surface; the
drawer should host either the simple editor or a notebook (mode toggle, or
notebooks as a distinct tab within the drawer).

Big open question — **storage** (decide with the user, this drives the design):
  - Where do notebooks persist? Options: (a) a DuckDB table managed by the
    extension (durable, queryable, matches "local DuckDB-native" vision — see
    `src/state.cpp` / `src/settings.cpp` for how the extension already persists
    state), (b) files on disk, (c) browser localStorage (simplest, least
    durable). The vision (DuckDB-native, local compute) leans toward (a).
  - How the frontend reads/writes them — likely a new HTTP endpoint in
    `src/http_server.cpp` (see `HttpServer::Run`) if stored server-side.

This is a larger feature; expect to break it into sub-tickets once the storage
model is chosen (e.g. "notebook data model + storage", "notebook UI/cells",
"list & manage saved notebooks"). Keep this ticket as the umbrella until then.
</context>

## Acceptance criteria

- [ ] Storage approach decided with the user and recorded (DuckDB table vs.
      file vs. localStorage) before implementation.
- [ ] Checked `ts/` + upstream `duckdb/` for a reusable notebook model before
      writing new; findings noted.
- [ ] User can create a notebook with multiple SQL cells and run cells.
- [ ] User can save a named notebook and reopen it later (persists across
      reloads).
- [ ] The simple single-query editor (T-005) remains available as the default;
      notebooks are an additional mode, not a replacement.
- [ ] Frontend build/lint (and, if a server endpoint is added, extension
      `make` + tests) pass.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created as an umbrella. Not started. Lower priority
  (advanced feature). Depends on T-005 for the surface; gated on a storage
  decision. Likely to be split into sub-tickets once storage is chosen.
