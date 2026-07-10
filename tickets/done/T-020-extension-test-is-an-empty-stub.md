---
id: T-020
title: Extension SQL test is an empty stub — no coverage for the gis launch verbs
status: done
priority: P2
area: src
depends_on: [T-014]
branch:
---

## Goal

The extension has effectively zero automated test coverage: the sole SQL test
file is a header with no assertions. A smoke test over the launch verbs would
have caught the `-ui`/`start_ui` regression in T-014. Done means the core
lifecycle (`start_gis_server` / `gis_is_started` / `stop_gis_server`, and the
`start_ui` alias if T-014 keeps one) is exercised by `unittest`.

## Context

<context>
`test/sql/ui.test` contains only:

```
# name: test/sql/ui.test
# description: test ui extension
# group: [sql]
```

No queries, no expected results. `./build/release/test/unittest` therefore
asserts nothing about our extension. There are no other test files under
`test/` besides `test/README.md`.

This is directly tied to T-014: a one-line smoke test invoking the launch verb
the `-ui` flag uses would have failed loudly when the rename dropped `start_ui`.

### Suggested remediation
Add SQLLogicTest cases in `test/sql/` (see the DuckDB extension template's test
format) that at minimum:
- `CALL start_gis_server();` returns a URL string and does not error.
- `FROM gis_is_started();` reflects started/stopped state.
- `CALL stop_gis_server();` stops cleanly (and is idempotent).
- If T-014 keeps `start_ui` as an alias, assert it resolves (guards the `-ui`
  flag).
Keep it hermetic (bind to an ephemeral port; avoid opening a browser — use the
`_server` verbs, not `start_gis`).
</context>

## Acceptance criteria

- [x] `test/sql/ui.test` (or new files) contains real assertions over the gis
      launch verbs.
- [x] `./build/release/test/unittest` runs them and passes.
- [x] The alias that keeps `-ui` working (per T-014) is covered.

## Progress log

- 2026-07-10: Filed by T-013 audit. `test/sql/ui.test` is header-only.
- 2026-07-10: Replaced the header-only stub with real SQLLogicTest assertions
  (`require ui`; hermetic — `SET ui_local_port=42131`, `*_server` verbs only, no
  browser). Covers: not-started → start (URL in status string) → both
  `gis_is_started` and `ui_is_started` report true → `get_gis_url` → idempotent
  re-start → stop → idempotent stop → the `start_ui_server`/`stop_ui_server`
  alias family (guards the T-014 `-ui` regression). Ran
  `./build/release/test/unittest test/sql/ui.test`: all 14 assertions pass. Done.
