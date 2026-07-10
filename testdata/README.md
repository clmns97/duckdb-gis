# testdata — persistent test database

A DuckDB file (`demo.duckdb`) with fixed spatial layers, so the dev loop and e2e
scripts render **real, stable data** instead of generating it on the fly each run.

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
| `pts`     | POINT        | 60,000 | dense, in the Zürich bbox 8.3–8.8 / 47.2–47.5; props `id`, `name` — feeds the ST_AsMVT tile path and the Arrow benchmark |

`pts` is deterministic (`setseed(0.42)` in `seed.sql`), so rebuilds are stable.

## Serve it

Launches `start_gis` against a throwaway copy (the committed fixture stays
pristine even when a test writes, e.g. `tile-check.mjs` creating `pts_tiles`):

```bash
testdata/serve.sh            # port 4213 (default)
# ... in another shell: cd frontend && pnpm dev   (vite proxies /ddb -> :4213)
# stop:  pkill -9 -f release/duckdb
```

Requires the fork build (`make release` → `build/release/duckdb` +
`build/release/extension/ui/ui.duckdb_extension`).

## Rebuild the fixture

```bash
testdata/build.sh            # runs seed.sql -> demo.duckdb (needs spatial ext)
```

Edit `seed.sql` and re-run to change the layers.
