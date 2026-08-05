---
id: T-054
title: Launch ergonomics — a `duckdb-gis` entrypoint without patching the DuckDB CLI
status: open
priority: P2
area: docs
depends_on: [T-052]
branch:
---

## Goal

A user has a one-word way to start the GIS UI, as close to `duckdb -gis` as is
possible without shipping our own DuckDB binary. "Done" means the README
documents a single copy-pasteable setup after which starting the GIS UI is one
short command, and a `duckdb-gis` shim script exists in the repo.

## Context

<context>
**`duckdb -gis` is not implementable from an extension.** The `-ui` flag is
hardcoded in DuckDB's *shell*, not contributed by the ui extension:
`duckdb/tools/shell/shell_command_line_option.cpp:202` registers the `ui` option
with handler `LaunchUI` (`:86`), which runs `state.ui_command` — defaulting to
the literal string `"CALL start_ui()"` at
`duckdb/tools/shell/include/shell_state.hpp:201`. Extensions cannot register CLI
flags. Adding `-gis` means patching and distributing our own `duckdb` binary,
which defeats the point of being an installable community extension ([T-055]).

What is achievable, in descending order of ergonomics:

1. **`.ui_command` is user-configurable.** The shell exposes a `.ui_command`
   metadata command (`duckdb/tools/shell/shell_metadata_command.cpp:924`, handler
   at `:523` which does `state.ui_command = "CALL " + command`). So
   `.ui_command start_gis()` in `~/.duckdbrc` makes plain `duckdb -ui` launch our
   UI instead of DuckDB's. Best feel, one-time setup, but it hijacks `-ui` for
   that user — document that trade-off honestly.
2. **A `duckdb-gis` shim.** A two-line script wrapping
   `duckdb -cmd "CALL start_gis()" "$@"` (`-cmd` runs before the interactive
   shell, so the user lands at a prompt with the UI already up). Ship it in
   `scripts/` and document the alias form for people who don't want a file on
   their PATH. This is the recommended headline entrypoint — it does not touch
   `-ui` and needs no rc file.

Note [T-052] removes the `start_ui` aliases at `src/ui_extension.cpp:147-150`,
so after that lands `duckdb -ui` will **not** start our UI unless the user sets
`.ui_command`. That is intended (the aliases collide with core `ui`), but it
means this ticket is what preserves a good launch story. Land them together or
in quick succession.

Also worth covering in the docs: the UI needs `spatial`, which is a core
extension and autoloads, so no extra install step — verify that claim before
writing it down.
</context>

## Acceptance criteria

- [ ] `scripts/duckdb-gis` (executable) starts DuckDB with the GIS UI running and
      drops the user at an interactive prompt; extra args pass through (e.g. a
      database file).
- [ ] README documents: the shim, the shell-alias one-liner, and the
      `~/.duckdbrc` + `.ui_command start_gis()` route with its trade-off stated.
- [ ] README states plainly that `duckdb -gis` is not possible and why (one
      sentence, no hand-waving).
- [ ] Verified end-to-end against a real build, not just written down.

## Progress log

- 2026-08-05: Filed. Investigated the DuckDB shell: `-ui` → `LaunchUI` →
  `state.ui_command` (default `CALL start_ui()`), configurable via `.ui_command`.
  Extensions cannot add CLI flags, so the shim + rc-file routes are the ceiling.
