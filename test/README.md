# Testing

## Extension (SQL)

`test/sql/` holds [SQLLogicTests](https://duckdb.org/dev/sqllogictest/intro.html)
for the extension's SQL functions. They run in CI on every PR, against each
supported DuckDB version.

```bash
make configure                               # once
make test_release                            # latest DuckDB
make test_release DUCKDB_TEST_VERSION=1.4.5  # another version
```

## Frontend (end-to-end)

`frontend/e2e/` is a Playwright suite that drives the app in Chromium, one spec
per feature area (catalog + SQL, layers, selection, editing, projects, attach,
Overture), plus `prod.spec.ts` against the bundle the extension itself serves.
It starts its own extension server (`testdata/serve.py`, port 4215, over a copy
of `testdata/demo.duckdb`) and Vite dev server (port 5174), so it doesn't clash
with a dev setup on 4214 / 5173.

```bash
make configure release                      # the suite serves build/release/gis.duckdb_extension
cd frontend
pnpm exec playwright install chromium       # once
pnpm test:e2e                               # everything
pnpm test:e2e editing                       # one spec file
pnpm test:e2e --grep-invert @network        # skip tests that need live Overture data
pnpm exec playwright show-trace test-results/<test>/trace.zip   # debug a failure
```

Each test gets a fresh page and a reset working catalog (`e2e/fixtures.ts`), and
fails on any unexpected console error.

It doesn't run on every push. In CI (`.github/workflows/E2E.yml`) start it from
the Actions tab with "Run workflow", or add the `run-e2e` label to a PR (it then
re-runs on each push while the label is on). `@network` tests are skipped there.
