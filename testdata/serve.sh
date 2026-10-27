#!/usr/bin/env bash
# Serve the persistent test database (testdata/demo.duckdb) through start_gis,
# so the frontend dev server (vite proxy -> /ddb) has real layers to render.
#
# The server runs against a THROWAWAY COPY of demo.duckdb, so tests that write
# to it (e.g. tile-check.mjs creating pts_tiles) never dirty the committed
# fixture. Kill with:  pkill -9 -f release/duckdb
#
# Usage:  testdata/serve.sh [port]     (default port 4214)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Any DuckDB CLI >= 1.4.5 loads the extension (it targets the stable C API);
# override with DUCKDB=/path/to/duckdb.
DUCKDB="${DUCKDB:-$(command -v duckdb || true)}"
EXT="$ROOT/build/release/gis.duckdb_extension"
PORT="${1:-4214}"

if [[ -z "$DUCKDB" || ! -x "$DUCKDB" ]]; then
  echo "no DuckDB CLI found — install one (>= 1.4.5) or set DUCKDB=/path/to/duckdb" >&2
  exit 1
fi
if [[ ! -f "$EXT" ]]; then
  echo "extension not built at $EXT — run 'make configure release' first" >&2
  exit 1
fi

if [[ ! -f "$ROOT/testdata/demo.duckdb" ]]; then
  echo "testdata/demo.duckdb not found — build it first with testdata/build.sh" >&2
  exit 1
fi

# Suffix-free temp name so it works with both GNU and BSD/macOS mktemp behaviour.
WORK="${TMPDIR:-/tmp}/duckdb-gis-demo-$$-$RANDOM.duckdb"
cp "$ROOT/testdata/demo.duckdb" "$WORK"
trap 'rm -f "$WORK"' EXIT

echo "Serving $WORK on port $PORT (Ctrl-C to stop)"
# start_gis spawns the HTTP server on a background thread; hold stdin open so the
# CLI process (and thus the server) stays alive. The harness blocks `sleep`, so
# use `tail -f /dev/null` as the keep-alive.
{
  printf "LOAD '%s';\n"          "$EXT"
  printf "INSTALL spatial; LOAD spatial;\n"
  printf "CALL start_gis(port := %s);\n" "$PORT"
  tail -f /dev/null
} | "$DUCKDB" -unsigned "$WORK"
