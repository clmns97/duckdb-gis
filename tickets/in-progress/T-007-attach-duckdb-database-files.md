---
id: T-007
title: Attach additional DuckDB database files to the catalog
status: open
priority: P1
area: frontend
depends_on: []
branch:
---

## Goal

Let the user attach one or more external DuckDB database files so their
schemas/tables appear in the Browser catalog alongside the default database.
This is the foundation of the "Add data source" flow; other source types
(object storage, Postgres) reuse the same entry point.

## Context

<context>
Today the Browser panel has an "Attach database" `+` button that does nothing —
`frontend/src/App.tsx` ~line 82–86. The catalog is built by
`frontend/src/lib/catalog.ts::loadCatalog()` from `duckdb_databases()` /
`duckdb_schemas()` / `duckdb_tables()`, and it already filters on the database
`internal` flag — so any newly `ATTACH`ed DB shows up automatically on the next
`loadCatalog()`.

Mechanics: `ATTACH '<path>.duckdb' AS <alias> (READ_ONLY)` via the existing
`query()` path (`frontend/src/lib/duckdb.ts`). Then refresh the catalog. This
is native in-process DuckDB, so the path is a **server-side** path (the
extension process's filesystem), not a browser file. Decide how the user
supplies the path — a text input for a path is the simplest v1; a real file
picker would need a server-side browse endpoint (out of scope for v1, note it).

Open points (note choices in Progress log):
  - Read-only vs read-write attach (recommend read-only default, safer).
  - Alias handling / collision with existing database names.
  - Detach affordance and error surfacing (bad path, locked file).
</context>

## Acceptance criteria

- [x] "Attach database" opens a way to specify a DuckDB file to attach.
- [x] Attaching runs `ATTACH` and the new database + its schemas/tables appear
      in the Browser tree after a catalog refresh.
- [x] Multiple databases can be attached simultaneously.
- [x] Errors (missing file, bad path, name collision) surface readably.
- [x] A way to detach exists (or is explicitly deferred and noted).
- [x] Frontend build/lint passes.

## Progress log

- 2026-07-09: Ticket created. Not started. Shared "Add data source" entry point
  reused by [[T-008]] and [[T-009]]. Pairs with the Browser panel ([[T-002]]).
- 2026-07-13: Implemented on branch `t-002-sidebar-tabs` (current working
  branch; no separate branch cut).
  - `frontend/src/lib/attach.ts` — subscribable store (mirrors `layers`/
    `selection`) + `attach.run({path, alias?, readOnly})` / `attach.detach(alias)`.
    Runs `ATTACH '<path>' AS "<alias>" (READ_ONLY)` via the existing `query()`
    path; alias/path are escaped (ident + string literal). Tracks the aliases
    *we* attached so the UI offers Detach only on those, never the default/
    in-memory db. `aliasFromPath()` derives a default alias from the filename stem.
  - `frontend/src/components/AttachModal.tsx` — form over `attach.run`: path
    (server-side), optional alias (placeholder shows the auto-derived default),
    read-only checkbox. Owns the async attach so it shows inline errors and
    **stays open on failure**; on success calls `onAttached` (catalog refresh)
    and closes.
  - `frontend/src/App.tsx` — wired the "Attach database" `+` button to open the
    modal; added `refreshCatalog()` (re-reads `loadCatalog()` into the tree, no
    reload) called after attach/detach. **Detach**: right-click an attached db
    node → context menu "Detach" (reuses the existing `ContextMenu`), gated on
    `attach.has(name)`.
  - `frontend/src/App.css` — `.text-input` (+ focus), `.modal-note.err`,
    `.modal-note code`, `.node.attached` (context-menu cursor).
  - **Decisions (from the ticket's open points):** read-only attach is the
    *default* (checkbox lets the user opt into read-write). Alias defaults to the
    filename stem, user-overridable; collisions are left to DuckDB and surfaced.
    Path is a typed **server-side** path (v1); a real file picker needs a
    server-side browse endpoint — deferred, noted in the modal copy.
  - Verified: `pnpm typecheck` + `pnpm build` clean (no `lint` script exists in
    frontend; typecheck is the lint gate). ATTACH/DETACH mechanics exercised
    against `build/release/duckdb`: read-only attach → table visible in
    `duckdb_tables()` → detach removes it; bad-path and alias-collision both
    produce readable IO/Binder errors that flow through `attach.run` into the
    modal. Live browser drive not run (needs the extension server up).
  - Next: eyeball on the running preview; then commit. Unblocks [[T-008]]'s
    "Add data source" entry-point items and [[T-009]].
