# testdata — persistent test database

A DuckDB file (`demo.duckdb`) with fixed spatial layers, so the dev loop and the
e2e suite render **real, stable data** instead of generating it on the fly each run.

`demo.duckdb` is **gitignored** (a generated artifact, not tracked). Build it
once with `build.sh` after cloning — the deterministic `seed.sql` makes it
byte-stable, so everyone gets the same fixture.

## Layers

All geometry columns are named `geom` (frontend convention).

| table     | geometry     | rows   | notes                                              |
|-----------|--------------|--------|----------------------------------------------------|
| `cities`  | POINT        | 8      | world cities; props `name`, `country`, `population`|
| `regions` | POLYGON      | 2      | bounding-box regions; prop `name`                  |
| `roads`   | LINESTRING   | 2      | routes; prop `name`                                |
| `pts`     | POINT        | 60,000 | dense, in the Zürich bbox 8.3–8.8 / 47.2–47.5; props `id`, `name` — the dense-layer render and attribute-table paging |

`pts` is deterministic (`setseed(0.42)` in `seed.sql`), so rebuilds are stable.

## Serve it

Starts the extension's server against a throwaway copy, so the fixture stays
pristine even when a test writes to it. Needs the built extension
(`make configure release`) and either the duckdb Python package or a DuckDB CLI:

```bash
configure/venv/bin/python testdata/serve.py   # port 4214; builds demo.duckdb if missing
testdata/serve.sh                             # same, via a `duckdb` CLI >= 1.4.5
# ... in another shell: cd frontend && pnpm dev   (vite proxies /ddb -> :4214)
```

`serve.py` names its copy `demo.duckdb`, so the catalog is `demo`. The e2e
suite (`frontend/e2e`) starts it on its own port.

## Rebuild the fixture

```bash
testdata/build.sh            # runs seed.sql -> demo.duckdb (needs a duckdb CLI + spatial)
rm testdata/demo.duckdb      # or: let serve.py rebuild it on its next start
```

Edit `seed.sql` and re-run to change the layers.
