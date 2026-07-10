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
- `design-reference/` — design assets/reference.
- `test/sql/` — SQL-level extension tests.
- `spike/` — experiments/prototypes; not production.

## Build & run

```sh
make                              # build (release); binaries land in build/release/
./build/release/duckdb            # DuckDB shell with extension auto-loaded
./build/release/duckdb -ui        # start the UI
./build/release/test/unittest     # run tests
```

`make` uses `extension-ci-tools/makefiles/duckdb_extension.Makefile`. Extension name is `ui` (`extension_config.cmake`).

## Ticket workflow

Work is tracked as self-contained markdown tickets under `tickets/` — the
board state is the folder (`open/` → `in-progress/` → `blocked/` → `done/`).
Tickets are the durable source of truth so work survives token resets: a cold
session or subagent picks up a ticket without the prior chat.

- **Resuming?** Read `tickets/in-progress/`; each ticket's Progress log says
  where it stands and what's next.
- **Working a ticket:** move it to `in-progress/`, keep its Progress log
  current, one ticket ≈ one branch ≈ one PR. On completion, move to `done/`.
- **New ticket:** copy `tickets/TEMPLATE.md` into `open/` with the next `T-NNN`.

See `tickets/README.md` for the full workflow.

## Vision

The north star: **replicate QGIS's functionality, but with DuckDB as the engine
and served through the browser** — while the compute stays DuckDB-native and
local (no remote backend; the extension runs the SQL/spatial work in-process).
Reach for QGIS's concepts and vocabulary (Layers panel, Browser panel,
Processing/Geoprocessing tools, Select Features, etc.) when designing UX, and
implement the geo operations as native DuckDB spatial SQL.

## Project context

Fork of `duckdb/duckdb-ui` serving our own MapLibre frontend; supersedes the earlier Quacklas prototype. Frontend dev uses Vite + pnpm (`pnpm dev`, port 5173), proxying the SQL-over-HTTP API to the extension server on `localhost:4213` (see `frontend/vite.config.ts`).
