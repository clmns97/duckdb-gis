#!/usr/bin/env python3
"""Serve testdata/demo.duckdb through the built gis extension.

Used by the e2e suite (frontend/playwright.config.ts), and handy by hand when no
DuckDB CLI is installed (serve.sh needs one). Only needs the duckdb Python
package, which `make configure` installs into configure/venv:

    configure/venv/bin/python testdata/serve.py [port]    # default 4214

Runs against a throwaway copy named demo.duckdb, so the catalog is `demo` and
the fixture itself is never written to. Builds demo.duckdb from seed.sql first
if it's missing.
"""
import os
import shutil
import sys
import tempfile
import threading

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXT = os.path.join(ROOT, "build", "release", "gis.duckdb_extension")
FIXTURE = os.path.join(HERE, "demo.duckdb")
port = int(sys.argv[1]) if len(sys.argv) > 1 else 4214

if not os.path.exists(EXT):
    sys.exit(f"extension not built at {EXT}; run 'make configure release' first")
if not os.path.exists(FIXTURE):
    with open(os.path.join(HERE, "seed.sql")) as f, duckdb.connect(FIXTURE) as seed:
        seed.execute(f.read())
    print(f"built {FIXTURE}", flush=True)

work = os.path.join(tempfile.mkdtemp(prefix="duckdb-gis-"), "demo.duckdb")
shutil.copy(FIXTURE, work)
con = duckdb.connect(work, config={"allow_unsigned_extensions": "true"})
con.execute(f"LOAD '{EXT}'")
con.execute("INSTALL spatial; LOAD spatial;")
print(con.execute(f"CALL start_gis_server(port := {port})").fetchone()[0], flush=True)
threading.Event().wait()  # the server runs on a background thread; stay alive
