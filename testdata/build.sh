#!/usr/bin/env bash
# Regenerate the persistent test database testdata/demo.duckdb from seed.sql.
# Uses whichever `duckdb` is on PATH (only needs the spatial extension); the
# output file is committed so tests don't have to regenerate data on the fly.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DB="$HERE/demo.duckdb"

rm -f "$DB"
duckdb "$DB" < "$HERE/seed.sql"

echo "Built $DB ($(du -h "$DB" | cut -f1))"
