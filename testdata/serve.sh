#!/usr/bin/env bash
# Serve the persistent test database (testdata/demo.duckdb) through start_gis,
# so the frontend dev server (vite proxy -> /ddb) has real layers to render.
#
# The server runs against a THROWAWAY COPY of demo.duckdb, so tests that write
# to it (e.g. tile-check.mjs creating pts_tiles) never dirty the committed
# fixture. Kill with:  pkill -9 -f release/duckdb
#
# Usage:  testdata/serve.sh [port]     (default port 4213)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUCKDB="$ROOT/build/release/duckdb"
EXT="$ROOT/build/release/extension/ui/ui.duckdb_extension"
PORT="${1:-4213}"

if [[ ! -x "$DUCKDB" ]]; then
  echo "fork build not found at $DUCKDB — run 'make release' first" >&2
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
  printf "SET ui_local_port=%s;\n" "$PORT"
  printf "CALL start_gis();\n"
  tail -f /dev/null
} | "$DUCKDB" -unsigned "$WORK"
