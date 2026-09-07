# duckdb-gis

A DuckDB **UI extension** (C++) that serves a browser-based GIS frontend, forked from `duckdb/duckdb-ui`. The extension runs an HTTP server that serves UI assets and handles SQL/DuckDB operations. See `README.md` for the architecture overview.

## Orientation — where the real code is

Only ~177 files are ours. **Ignore the vendored submodules** unless explicitly investigating upstream behavior:

- `duckdb/` — upstream DuckDB source (289 MB submodule). **Do not search/grep here by default.**
- `extension-ci-tools/`, `third_party/` — vendored build tooling / deps. Ignore by default.

Our code:

- `src/` — C++ extension. Key files: `http_server.cpp` (HTTP endpoints — SQL run, interrupt, tokenize, events; see `HttpServer::Run`), `event_dispatcher.cpp`, `state.cpp`, `settings.cpp`, `watcher.cpp`, `ui_extension.cpp`. Headers in `src/include/`, helpers in `src/utils/`.
- `ts/` — TypeScript packages for the UI (e.g. `duckdb-ui-client`, `duckdb-data-reader`). See `ts/README.md`.
- `frontend/` — our MapLibre-based GIS frontend (the point of the fork).
- `design-system/` — `@duckdb-gis/ui-kit`, the Storybook UI kit. Components
  re-export from `frontend/src`; the frontend is the source of truth.
- `test/sql/` — SQL-level extension tests.
- `testdata/` — deterministic demo fixture (`seed.sql` → `build.sh` → a
  gitignored `demo.duckdb`) and `serve.sh` for e2e runs.
- `scripts/` — build helpers, notably `generate_embedded_assets.py`.

Gitignored, so **not present in a fresh clone** — they exist only on a machine
where they were generated: `design-reference/` (Phase-1 design capture),
`spike/` (throwaway prototypes), `build/`, `ds-bundle/`, `node_modules/`.

## Build & run

```sh
make                                       # build (release); binaries land in build/release/
./build/release/duckdb                     # DuckDB shell with extension auto-loaded
./build/release/duckdb -cmd "CALL start_gis_server()"   # start the UI
./build/release/test/unittest              # run tests
```

`make` uses `extension-ci-tools/makefiles/duckdb_extension.Makefile`. Extension name is `gis` (`extension_config.cmake`).

## Work tracking

Work is tracked in **GitHub Issues**. There is no in-repo board.

- **Choosing what to work on:** `gh issue list --label "priority: P1"`, or
  filter by `area: frontend` / `area: src` / `area: build` / `area: docs`.
- **Resuming?** `gh issue list --label "status: in-progress"`, then read that
  issue's comments — the progress history lives there.
- **Working an issue:** one issue ≈ one branch ≈ one PR. Branches are
  `type/short-description` (`feat/`, `fix/`, `docs/`, `refactor/`, `chore/`)
  with Conventional Commit messages. Record progress as issue comments so the
  state survives a context loss.

See `CONTRIBUTING.md` for the contributor-facing version.

## Vision

The north star: **replicate QGIS's functionality, but with DuckDB as the engine
and served through the browser** — while the compute stays DuckDB-native and
local (no remote backend; the extension runs the SQL/spatial work in-process).
Reach for QGIS's concepts and vocabulary (Layers panel, Browser panel,
Processing/Geoprocessing tools, Select Features, etc.) when designing UX, and
implement the geo operations as native DuckDB spatial SQL.

## Project context

Fork of `duckdb/duckdb-ui` serving our own MapLibre frontend; supersedes the earlier Quacklas prototype. Frontend dev uses Vite + pnpm (`pnpm dev`, port 5173), proxying the SQL-over-HTTP API to the extension server on `localhost:4214` (see `frontend/vite.config.ts`).
