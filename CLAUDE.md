# duckdb-gis

A DuckDB **GIS extension** (C++) that serves a browser-based GIS frontend. It began as a fork of `duckdb/duckdb-ui` and is now developed as a standalone project. The extension runs an HTTP server that serves UI assets and handles SQL/DuckDB operations. See `README.md` for the architecture overview.

## Orientation — where the real code is

Only ~290 files are ours. **Ignore the vendored submodules** unless explicitly investigating upstream behavior:

- `extension-ci-tools/`, `third_party/`, `duckdb_capi/` — vendored build tooling, deps (cpp-httplib, nanoarrow) and DuckDB's C API headers. Ignore by default.

Our code:

- `src/` — C++ extension on DuckDB's **stable C extension API** (no DuckDB C++ internals; see #88). `gis_extension.cpp` (entrypoint, SQL functions), `http_server.cpp` (embedded frontend, `/ddb/run`, `/ddb/interrupt`), `query.cpp` (SQL → Arrow IPC via nanoarrow). Headers in `src/include/`.
- `frontend/` — our MapLibre-based GIS frontend (the point of the project).
- `design-system/` — `@duckdb-gis/ui-kit`, the Storybook UI kit. Components
  re-export from `frontend/src`; the frontend is the source of truth.
- `test/sql/` — SQL-level extension tests.
- `testdata/` — deterministic demo fixture (`seed.sql` → `build.sh` → a
  gitignored `demo.duckdb`); `serve.py` serves it for the e2e suite.
- `scripts/` — build helpers, notably `generate_embedded_assets.py`.

Gitignored, so **not present in a fresh clone** — they exist only on a machine
where they were generated: `design-reference/` (Phase-1 design capture),
`spike/` (throwaway prototypes), `build/`, `ds-bundle/`, `node_modules/`.

## Build & run

```sh
make configure                             # once: Python venv with duckdb + test runner
make                                       # build/release/gis.duckdb_extension
make test_release                          # test/sql via duckdb_sqllogictest (latest duckdb)
make test_release DUCKDB_TEST_VERSION=1.4.5   # ...against another DuckDB
duckdb -unsigned -cmd "LOAD 'build/release/gis.duckdb_extension'; FROM start_gis_server()"
```

`make` uses `extension-ci-tools/makefiles/c_api_extensions/`. Extension name is `gis`; it targets C API `TARGET_DUCKDB_VERSION=v1.2.0` (Makefile), i.e. one binary for DuckDB 1.4 LTS and later. Only call DuckDB through `duckdb_*` C functions available in that band (see `duckdb_capi/duckdb_extension.h`).

## Testing

Three layers; see `test/README.md` for details.

- **C++ / SQL:** `make test_release` (`test/sql/*.test`). Runs in CI on every push.
- **Frontend static:** `cd frontend && pnpm typecheck` (plus `pnpm build`). CI
  (`Frontend.yml`) on every push.
- **End-to-end (Playwright, `frontend/e2e/`):** `cd frontend && pnpm test:e2e`
  (or `pnpm test:e2e editing` for one spec file). Needs a built extension
  (`make release`) and `make configure`'s venv. It starts its own extension
  server (`testdata/serve.py` on port 4215, over a throwaway copy of
  `demo.duckdb`) and Vite on 5174, so it runs beside a normal dev setup.
  ~3–4 min. Tests read app state through the DEV-only `window.gis*` seam
  (`App.tsx`) via the `app` fixture (`e2e/fixtures.ts`), which resets the
  server between tests and fails a test on any unexpected console error.
  `@network` tests hit live Overture S3 and are skipped in CI.

**When to run e2e:** after major changes (refactors, rendering/editing/store
changes, dependency bumps) — not on every small edit. It is opt-in in CI
(`.github/workflows/E2E.yml`, no cron): add the `run-e2e` label to a PR (it
then re-runs on each push until removed) or use "Run workflow" in Actions.
A bug the suite finds but that isn't fixed yet gets pinned with `test.fail()`
plus a comment, so the suite stays green and flags the fix.

## Work tracking

Work is tracked in **GitHub Issues**. There is no in-repo board.

**Currently in a milestone-gated phase (decided 2026-09-08).** The project
had drifted into ~11 issues open "in progress" at once — feature surface
growing faster than the core loop was solid, features getting duct-taped onto
a build that wasn't reliably green. Until
[v0.1.0](https://github.com/clmns97/duckdb-gis/milestone/1) closes:

- **Choosing what to work on:** `gh issue list --milestone "v0.1.0 — harden
  the core loop"`. Nothing outside that milestone, even a filed P1, until it
  ships. The milestone description is the actual gate (CI green including the
  fresh-install crash, project save/open, undo, unsaved-work warning, correct
  CRS handling, Overture quick-load working — the core loop, not new surface).
- **Do not start** repo-public-visibility work (#61) or the
  community-extensions submission (#55) — both explicitly wait until this
  milestone closes, not in parallel with it.
- The P2/P3 backlog (dark mode, CAD tools, dockable panels, SQL notebooks,
  additional attach sources, …) stays filed but frozen — don't pick it up
  even if idle.
- **Resuming?** `gh issue list --label "status: in-progress"`, then read that
  issue's comments — the progress history lives there. This should be a short
  list right now; if it isn't, that's the drift happening again.
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

Derived from `duckdb/duckdb-ui`, serving our own MapLibre frontend; developed in a standalone repo and does not track upstream. Supersedes the earlier Quacklas prototype. Frontend dev uses Vite + pnpm (`pnpm dev`, port 5173), proxying the SQL-over-HTTP API to the extension server on `localhost:4214` (see `frontend/vite.config.ts`).
