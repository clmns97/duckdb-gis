---
id: T-014
title: start_gis rename breaks the `-ui` launch flag and desyncs docs
status: done
priority: P1
area: src
depends_on: []
branch:
---

## Goal

`./build/release/duckdb -ui` (the documented CLI entry point) must launch the
GIS UI again. Right now the uncommitted rename of the launch table functions
from the `start_ui` family to the `start_gis` family removed the exact name the
DuckDB core shell invokes for `-ui`, so the flag errors out. Done means the
CLI flag works, the SQL verbs are consistent, and the docs match.

## Context

<context>
The working-tree change in `src/ui_extension.cpp` (uncommitted; see
`git diff src/ui_extension.cpp`) renames the registered table functions:

- `src/ui_extension.cpp:137-142`: `start_ui` → `start_gis`,
  `start_ui_server` → `start_gis_server`, `stop_ui_server` → `stop_gis_server`,
  `get_ui_url` → `get_gis_url`, `ui_is_started` → `gis_is_started`.

But the DuckDB core shell hardcodes the command run by the `-ui` flag:

- `duckdb/tools/shell/include/shell_state.hpp:201`: `string ui_command = "CALL start_ui()";`
- `duckdb/tools/shell/shell_command_line_option.cpp:88`: the `-ui` launch flag
  runs `state.ui_command` as-is. It is only overridable via the interactive
  `.ui_command` dot-command (`shell_metadata_command.cpp:523`), which cannot run
  *before* the `-ui` launch flag fires.

Net effect: after this rename, `duckdb -ui` runs `CALL start_ui()` and fails
with a Catalog Error (function no longer exists). `CALL start_gis()` from SQL
still works; only the `-ui` shortcut and anything calling `start_ui` breaks.

The frontend already expects the new names (`frontend/vite.config.ts:4`,
`frontend/src/lib/duckdb.ts:6` reference `start_gis`), so a straight revert is
not ideal.

Docs are also out of sync with the rename:
- `README.md:41` still says `call start_ui();`
- `README.md:36` and `CLAUDE.md` still document `./build/release/duckdb -ui`.

### Suggested remediation
Register BOTH names — keep `start_ui`/`start_ui_server`/`stop_ui_server`/
`get_ui_url`/`ui_is_started` as aliases alongside the `start_gis` family — so
the core `-ui` flag keeps working while our own verbs read as `gis`. (Simplest:
call `REGISTER_TF` twice, once per name.) Then commit the change (see T-015) and
fix the docs (see T-017 for the broader README rewrite). Add a smoke test that
`CALL start_gis_server()` / `gis_is_started()` work (see T-020).
</context>

## Acceptance criteria

- [x] `./build/release/duckdb -ui` launches the UI (no Catalog Error).
- [x] `CALL start_gis()` and the rest of the `gis` verbs work from SQL.
- [x] `src/ui_extension.cpp` change committed (not left in the working tree).
- [x] `make` and `./build/release/test/unittest` pass.

## Progress log

- 2026-07-10: Filed by T-013 audit. Confirmed via
  `duckdb/tools/shell/include/shell_state.hpp:201` that `-ui` runs
  `CALL start_ui()`; the working-tree rename removes that function.
- 2026-07-10: Moved to in-progress. Applied suggested remediation in
  `src/ui_extension.cpp:136-165`: registered BOTH the `start_gis` family and the
  original `start_ui`/`start_ui_server`/`stop_ui_server`/`get_ui_url`/
  `ui_is_started` names as aliases (same handler fns). This keeps `duckdb -ui`
  (hardcoded `CALL start_ui()`) working while our verbs read as `gis`.
  Build env gotcha: `cmake`/`ninja` are in the `duckdb-build` venv, not on PATH —
  prepend `/home/clemens/.venvs/duckdb-build/bin`. Rebuild in progress; will
  verify `-ui` + both verb families, then commit. Decision (per user): commit
  directly to main, per-ticket commits.
- 2026-07-10: Build succeeded (`make`, exit 0) with the aliases. Verified:
  `CALL start_ui()` (the exact command the `-ui` flag hardcodes) resolves,
  starts the server, returns "Navigate browser to http://localhost:PORT/" — no
  Catalog Error (browser-open only fails because this env is headless). The
  `gis` family (`start_gis_server`, `gis_is_started`, `get_gis_url`,
  `stop_gis_server`) and the `ui` aliases (`start_ui_server`, `ui_is_started`,
  `stop_ui_server`) all resolve and drive the same server. `test/sql/ui.test`
  (T-020) passes (14 assertions). Committing `src/ui_extension.cpp` on main. Done.
