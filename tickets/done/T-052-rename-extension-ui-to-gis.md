---
id: T-052
title: Rename the extension from `ui` to `gis` (drop start_ui aliases, gis_ settings)
status: open
priority: P1
area: build
depends_on: []
branch:
---

## Goal

The extension is named `gis`, not `ui`. It builds as `gis.duckdb_extension`,
registers `start_gis()` / `stop_gis_server()` / `get_gis_url()` /
`gis_is_started()` and settings `gis_local_port` / `gis_remote_url` /
`gis_polling_interval` — and it can be `LOAD`ed **alongside** DuckDB's core `ui`
extension in the same session without a collision. "Done" means a user can
`LOAD ui; LOAD gis;` and both work.

## Context

<context>
Prerequisite for community-extension listing (see [T-055]). Two independent
reasons this is required:

1. **Name collision.** The extension is literally named `ui` today
   (`CMakeLists.txt:4` `set(TARGET_NAME ui)`, `Makefile:4` `EXT_NAME=ui`,
   `extension_config.cmake:4` `duckdb_extension_load(ui ...)`,
   `UiExtension::Name()` at `src/ui_extension.cpp:174`,
   `DUCKDB_CPP_EXTENSION_ENTRY(ui, loader)` at `src/ui_extension.cpp:183`,
   `extension_name: ui` in `.github/workflows/MainDistributionPipeline.yml`).
   DuckDB already ships a core extension named `ui`. Community extension names
   must be unique against core.
2. **Symbol collision.** `src/ui_extension.cpp:147-150` deliberately re-registers
   `start_ui` / `start_ui_server` / `stop_ui_server` / `get_ui_url`, plus
   `ui_is_started` at `:158-165`, as aliases so `duckdb -ui` keeps working (the
   shell hardcodes `CALL start_ui()`, see [T-054]). Once we ship as a separate
   `gis` extension this backfires: a user with core `ui` installed gets duplicate
   catalog entries for the same function names. **Drop the `ui`-named aliases.**
   Same story for the extension options registered at
   `src/ui_extension.cpp:110-134` — `AddExtensionOption("ui_local_port", ...)`
   will clash with core `ui`'s identically-named options, so rename the setting
   names (`src/include/settings.hpp:6-11`).

Keep the upstream diff thin. This is a fork of `duckdb/duckdb-ui` and we merge
upstream regularly (`docs/UPDATING.md`); every gratuitous rename is a future
merge conflict. So:
- **Do** rename at the build/registration boundary: `TARGET_NAME`, `EXT_NAME`,
  `extension_config.cmake`, the entry point macro, `UiExtension::Name()`, the
  `REGISTER_TF` table, the setting name `#define`s, the workflow
  `extension_name:` inputs (three jobs in `MainDistributionPipeline.yml`), and
  the data dir `~/.duckdb/extension_data/ui` (`src/ui_extension.cpp:107`).
- **Do not** rename files (`src/ui_extension.cpp` stays), the `UiExtension` C++
  class, the `duckdb::ui` namespace, or internal function names
  (`StartUIFunction` etc.). They are invisible to users and renaming them buys
  nothing but conflicts.

Gotchas:
- The non-`DUCKDB_CPP_EXTENSION_ENTRY` path also exports `ui_init` /
  `ui_version` C symbols (`src/ui_extension.cpp:185+`) — these must match the
  extension name or loading fails with a confusing "not found" error.
- `test/sql/` and `LOAD_TESTS` in `extension_config.cmake` reference the name.
- The frontend calls the API routes, not the function names, so `frontend/`
  should need no change — but grep it for `start_ui`/`ui_remote_url` anyway.
- Env-var fallbacks are read via `GetEnvOrDefault(UI_*_SETTING_NAME, ...)`
  (`src/ui_extension.cpp:110-134`), so renaming the `#define` values also renames
  the env vars. Update `frontend/vite.config.ts` comments / any dev scripts that
  set them.
</context>

## Acceptance criteria

- [x] `make` produces `gis.duckdb_extension`; the extension loads.
- [x] `CALL start_gis()`, `CALL stop_gis_server()`, `SELECT * FROM gis_is_started()`
      and `SET gis_remote_url = ...` all work.
- [x] No `start_ui` / `ui_is_started` / `ui_*` setting is registered by us.
- [x] `LOAD ui; LOAD gis;` in one session succeeds with no duplicate-name error.
- [x] `.github/workflows/MainDistributionPipeline.yml` builds under the new name
      (all 7 jobs — the ticket said "three" but every job, including the two
      deploy jobs, has its own `extension_name:` input).
- [x] Extension data dir is `~/.duckdb/extension_data/gis`.
- [x] `make` + `./build/release/test/unittest` pass; README/CLAUDE.md updated.

## Progress log

- 2026-08-05: Filed. Root of the packaging chain — [T-053], [T-054], [T-055] all
  depend on this. Note a partial rename already happened (commit history: the
  `start_gis` family exists at `src/ui_extension.cpp:137-140`); this ticket
  finishes it and removes the `ui`-named aliases.
- 2026-08-05: Implemented. Renamed `TARGET_NAME`/`EXT_NAME` to `gis`,
  `extension_config.cmake`, dropped the `start_ui`/`*_ui` aliases and
  `ui_is_started` registration, renamed the setting-name string values (env
  vars follow automatically via `GetEnvOrDefault`'s uppercasing), renamed the
  `~/.duckdb/extension_data` subdir, renamed the `DUCKDB_CPP_EXTENSION_ENTRY`
  macro + `gis_init`/`gis_version` C symbols, renamed `STORAGE_EXTENSION_KEY`
  ("ui" → "gis", needed so the storage-extension map doesn't collide when both
  `ui` and `gis` are loaded), renamed `extension_name: ui` → `gis` in all 7
  `MainDistributionPipeline.yml` jobs (not just 3), renamed+rewrote
  `test/sql/ui.test` → `gis.test`, updated README/CLAUDE.md/frontend package
  description.
  **Correction to this ticket's "do not rename" guidance:** the C++ header
  `src/include/ui_extension.hpp` and the `UiExtension` class *did* need
  renaming to `gis_extension.hpp` / `GisExtension` — DuckDB's static-link
  codegen (`duckdb/extension/CMakeLists.txt`) hardcodes the convention
  `${EXT_NAME}_extension.hpp` containing a `${CamelCase(EXT_NAME)}Extension`
  class, and generates `db.LoadStaticExtension<GisExtension>()` from
  `TARGET_NAME=gis`. This isn't optional — the build fails to compile
  otherwise. `src/ui_extension.cpp` (the .cpp filename) and the `duckdb::ui`
  namespace (used by `HttpServer`, `EventDispatcher`, etc.) were left alone as
  originally instructed; only the header/class tied to the codegen convention
  had to move.
  Verifying: `make` + `./build/release/test/unittest` running now.
