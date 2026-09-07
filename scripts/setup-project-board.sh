#!/usr/bin/env bash
# Create and populate the duckdb-gis Projects v2 board from issue labels.
# Safe to re-run: reuses a board with the same title and skips items already added.
# Requires: gh auth refresh -s project,read:project
# Uses gh's embedded jq (-q); no external jq needed.
set -euo pipefail

OWNER=clmns97
REPO=clmns97/duckdb-gis
TITLE="duckdb-gis roadmap"

if ! gh auth status 2>&1 | grep "Token scopes:" | grep -q "project"; then
  echo "ERROR: gh token lacks the project scope." >&2
  echo "Run: gh auth refresh -s project,read:project" >&2
  exit 1
fi

plist() { gh project list --owner "$OWNER" --format json -q "$1"; }

# --- 1. project ------------------------------------------------------------
PID=$(plist ".projects[] | select(.title==\"$TITLE\") | .id" | head -1)
if [ -z "$PID" ]; then
  echo "Creating project '$TITLE'..."
  gh project create --owner "$OWNER" --title "$TITLE" >/dev/null
  PID=$(plist ".projects[] | select(.title==\"$TITLE\") | .id" | head -1)
fi
NUM=$(plist ".projects[] | select(.title==\"$TITLE\") | .number" | head -1)
echo "Project #$NUM"

flist() { gh project field-list "$NUM" --owner "$OWNER" --limit 50 --format json -q "$1"; }

# --- 2. add a Blocked option to the built-in Status field -------------------
# updateProjectV2Field REPLACES the option set, so resend existing names + Blocked.
if ! flist '.fields[] | select(.name=="Status") | .options[].name' | grep -qx "Blocked"; then
  echo "Adding 'Blocked' to Status..."
  STATUS_FID=$(flist '.fields[] | select(.name=="Status") | .id')
  OPTS=""
  while IFS= read -r name; do
    case "$name" in
      Todo)          c=GRAY ;;
      "In Progress") c=YELLOW ;;
      Done)          c=GREEN ;;
      *)             c=GRAY ;;
    esac
    OPTS+="{name:\"$name\",color:$c,description:\"\"},"
  done < <(flist '.fields[] | select(.name=="Status") | .options[].name')
  OPTS+='{name:"Blocked",color:RED,description:"Waiting on a dependency or decision"}'
  gh api graphql -f query="mutation{
    updateProjectV2Field(input:{fieldId:\"$STATUS_FID\",singleSelectOptions:[$OPTS]}){
      projectV2Field{ ... on ProjectV2SingleSelectField { id } } } }" >/dev/null
fi

# --- 3. Priority / Area fields ---------------------------------------------
mkfield() {
  if ! flist ".fields[] | select(.name==\"$1\") | .id" | grep -q .; then
    echo "Creating field '$1'..."
    gh project field-create "$NUM" --owner "$OWNER" --name "$1" \
      --data-type SINGLE_SELECT --single-select-options "$2" >/dev/null
  fi
}
mkfield Priority "P1 — Next up,P2 — Wanted,P3 — Someday"
mkfield Area "frontend,src,build,docs"

F_STATUS=$(flist '.fields[] | select(.name=="Status")   | .id')
F_PRIO=$(  flist '.fields[] | select(.name=="Priority") | .id')
F_AREA=$(  flist '.fields[] | select(.name=="Area")     | .id')

oid() { flist ".fields[] | select(.name==\"$1\") | .options[] | select(.name|startswith(\"$2\")) | .id" | head -1; }

O_TODO=$(oid Status Todo);      O_PROG=$(oid Status "In Progress")
O_DONE=$(oid Status Done);      O_BLOCK=$(oid Status Blocked)
O_P1=$(oid Priority P1); O_P2=$(oid Priority P2); O_P3=$(oid Priority P3)

# --- 4. add issues + set fields, BATCHED via GraphQL aliases ----------------
# Many items per request (~14 requests total) instead of ~4 per issue, which is
# what tripped GitHub's secondary GraphQL rate limit.
ADD_BATCH=${ADD_BATCH:-8}
SET_BATCH=${SET_BATCH:-6}   # x3 fields = 18 aliased mutations per request
THROTTLE=${THROTTLE:-3}

snooze() { local n=$1; while [ "$n" -gt 0 ]; do sleep 1; n=$((n-1)); done; }

A_FRONTEND=$(oid Area frontend); A_SRC=$(oid Area src)
A_BUILD=$(oid Area build);       A_DOCS=$(oid Area docs)

gql_retry() {
  local q="$1"; shift; local try=0 out
  while :; do
    if out=$(gh api graphql -f query="$q" "$@" 2>&1); then printf '%s' "$out"; return 0; fi
    case "$out" in
      *"rate limit"*|*RATE_LIMIT*|*secondary*|*abuse*)
        try=$((try+1))
        [ "$try" -gt 8 ] && { echo "giving up after $try retries: $out" >&2; return 1; }
        local w=$((60*try))
        echo "    rate limited; waiting ${w}s (retry $try/8)..." >&2
        snooze "$w" ;;
      *) echo "$out" >&2; return 1 ;;
    esac
  done
}

MAP=/tmp/gis-board-map.txt   # "issueNumber<TAB>itemId"
: > "$MAP"
gh project item-list "$NUM" --owner "$OWNER" --limit 300 --format json \
  -q '.items[] | select(.content.number != null) | "\(.content.number)\t\(.id)"' >> "$MAP" || true
echo "Already on board: $(grep -c . "$MAP" || true)"

gh issue list -R "$REPO" --state all --limit 300 --json number,id,state,labels \
  -q '.[] | [.number, .id, .state, ([.labels[].name] | join(";"))] | @tsv' > /tmp/gis-issues.tsv

# --- 4a. batch-add missing issues ------------------------------------------
NEED=$(while IFS=$'\t' read -r n cid _ _; do
         grep -q "^$n\b" "$MAP" || printf '%s\t%s\n' "$n" "$cid"
       done < /tmp/gis-issues.tsv)

if [ -n "$NEED" ]; then
  echo "Adding $(grep -c . <<<"$NEED") new item(s)..."
  batch=""; nums=(); k=0
  flush_add() {
    [ -z "$batch" ] && return 0
    local res; res=$(gql_retry "mutation{ $batch }") || exit 1
    local idx=0
    while IFS= read -r id; do
      printf '%s\t%s\n' "${nums[$idx]}" "$id" >> "$MAP"; idx=$((idx+1))
    done < <(printf '%s' "$res" | python3 -c 'import json,sys
d = json.load(sys.stdin)["data"]
for key in sorted(d, key=lambda x: int(x[1:])):
    print(d[key]["item"]["id"])')
    batch=""; nums=(); k=0
    snooze "$THROTTLE"
  }
  while IFS=$'\t' read -r n cid; do
    batch+=" i${k}: addProjectV2ItemById(input:{projectId:\"$PID\",contentId:\"$cid\"}){item{id}}"
    nums+=("$n"); k=$((k+1))
    [ "$k" -ge "$ADD_BATCH" ] && flush_add
  done <<< "$NEED"
  flush_add
fi

# --- 4b. batch-set fields for every issue -----------------------------------
echo "Setting fields..."
batch=""; k=0
flush_set() {
  [ -z "$batch" ] && return 0
  gql_retry "mutation{ $batch }" >/dev/null || exit 1
  batch=""; k=0
  snooze "$THROTTLE"
}

while IFS=$'\t' read -r n cid state labels; do
  item=$(grep -m1 -P "^$n\t" "$MAP" | cut -f2)
  [ -z "$item" ] && { echo "  WARN: no item for #$n" >&2; continue; }

  if   [ "$state" = "CLOSED" ];                    then st=Done;          sid=$O_DONE
  elif grep -q "status: blocked"     <<<"$labels"; then st=Blocked;       sid=$O_BLOCK
  elif grep -q "status: in-progress" <<<"$labels"; then st="In Progress"; sid=$O_PROG
  else st=Todo; sid=$O_TODO; fi

  prio=$(grep -o 'priority: P[123]' <<<"$labels" | head -1 | sed 's/priority: //' || true)
  case "$prio" in P1) pv=$O_P1;; P2) pv=$O_P2;; P3) pv=$O_P3;; *) pv="";; esac
  area=$(grep -o 'area: [a-z]*' <<<"$labels" | head -1 | sed 's/area: //' || true)
  case "$area" in frontend) av=$A_FRONTEND;; src) av=$A_SRC;;
                  build) av=$A_BUILD;; docs) av=$A_DOCS;; *) av="";; esac

  fv() { printf 's%s_%s: updateProjectV2ItemFieldValue(input:{projectId:"%s",itemId:"%s",fieldId:"%s",value:{singleSelectOptionId:"%s"}}){projectV2Item{id}} ' "$k" "$1" "$PID" "$item" "$2" "$3"; }
  batch+=$(fv a "$F_STATUS" "$sid")
  [ -n "$pv" ] && batch+=$(fv b "$F_PRIO" "$pv")
  [ -n "$av" ] && batch+=$(fv c "$F_AREA" "$av")
  k=$((k+1))
  echo "  #$n -> $st${prio:+ / $prio}${area:+ / $area}"
  [ "$k" -ge "$SET_BATCH" ] && flush_set
done < /tmp/gis-issues.tsv
flush_set

echo
echo "Board: https://github.com/users/$OWNER/projects/$NUM"
