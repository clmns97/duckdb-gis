#!/usr/bin/env bash
# duckdb-gis preview server.
#
# Spins up the GIS UI so it can be viewed from another device over Tailscale:
#
#   phone --Tailscale--> Vite :5173 (0.0.0.0) --proxy--> extension :4213 (loopback)
#
# The extension server stays loopback-only; only Vite is exposed. Both
# processes are launched detached (setsid) so they outlive the shell/chat.
#
# Usage: serve.sh [start|status|stop|url|logs]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_DIR="${TMPDIR:-/tmp}/duckdb-gis-preview"
EXT_PID="$RUN_DIR/ext.pid"; EXT_LOG="$RUN_DIR/ext.log"
VITE_PID="$RUN_DIR/vite.pid"; VITE_LOG="$RUN_DIR/vite.log"
PORT_VITE=5173; PORT_EXT=4213
DUCKDB="$REPO/build/release/duckdb"
DEMO="$REPO/testdata/demo.duckdb"; WORK_DB="$RUN_DIR/demo.duckdb"
mkdir -p "$RUN_DIR"

ts_ip() { tailscale ip -4 2>/dev/null | head -1; }

vite_up()  { curl -sS --max-time 2 "http://127.0.0.1:$PORT_VITE/" >/dev/null 2>&1; }
# Any HTTP response (even a 403 from the same-origin gate) means it's listening.
ext_up()   { curl -sS --max-time 2 "http://localhost:$PORT_EXT/" >/dev/null 2>&1; }

wait_for() { # wait_for <fn> <label>
  for _ in $(seq 1 60); do "$1" && return 0; sleep 0.5; done
  echo "ERROR: $2 did not come up in 30s (see logs)" >&2; return 1
}

url() { echo "http://$(ts_ip):$PORT_VITE/"; }

start() {
  [ -x "$DUCKDB" ] || { echo "ERROR: $DUCKDB missing — run 'make' first." >&2; exit 1; }

  if ext_up; then
    echo "extension: already up on :$PORT_EXT"
  else
    # Serve a THROWAWAY COPY of the demo database so the UI has real layers to
    # render and writes never dirty the committed fixture (mirrors
    # testdata/serve.sh). Without a db file the server would open an empty
    # in-memory catalog and the Browser panel would be blank.
    [ -f "$DEMO" ] || { echo "ERROR: $DEMO missing — build it with testdata/build.sh." >&2; exit 1; }
    cp "$DEMO" "$WORK_DB"
    # Keep duckdb alive after start_gis_server returns by holding stdin open
    # (sleep never closes the pipe -> duckdb blocks reading -> server thread lives).
    setsid bash -c '{ printf "INSTALL spatial; LOAD spatial;\nCALL start_gis_server();\n"; sleep 2147483647; } | exec "'"$DUCKDB"'" "'"$WORK_DB"'"' \
      >"$EXT_LOG" 2>&1 </dev/null &
    echo $! >"$EXT_PID"
    wait_for ext_up "extension server"
    echo "extension: started on :$PORT_EXT (loopback), serving demo.duckdb"
  fi

  if vite_up; then
    echo "vite: already up on :$PORT_VITE"
  else
    setsid bash -c 'cd "'"$REPO"'/frontend" && exec pnpm dev --host 0.0.0.0 --port '"$PORT_VITE" \
      >"$VITE_LOG" 2>&1 </dev/null &
    echo $! >"$VITE_PID"
    wait_for vite_up "vite dev server"
    echo "vite: started on 0.0.0.0:$PORT_VITE"
  fi

  echo
  echo "  Open on your phone:  $(url)"
}

status() {
  ext_up  && echo "extension :$PORT_EXT  UP" || echo "extension :$PORT_EXT  down"
  vite_up && echo "vite      :$PORT_VITE  UP  -> $(url)" || echo "vite      :$PORT_VITE  down"
}

stop() {
  for f in "$VITE_PID" "$EXT_PID"; do
    [ -f "$f" ] || continue
    pid="$(cat "$f")"
    # setsid made each a process-group leader; kill the whole group.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$f"
  done
  echo "stopped."
}

case "${1:-start}" in
  start)  start ;;
  status) status ;;
  stop)   stop ;;
  url)    url ;;
  logs)   echo "== ext =="; tail -n 20 "$EXT_LOG" 2>/dev/null; echo "== vite =="; tail -n 20 "$VITE_LOG" 2>/dev/null ;;
  *) echo "usage: serve.sh [start|status|stop|url|logs]" >&2; exit 2 ;;
esac
