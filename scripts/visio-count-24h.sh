#!/usr/bin/env bash
set -euo pipefail

# Counts /visio invocations over the last 24h, plus a 24-char hourly sparkline.
#
# Reads logs from the Scaleway Cockpit Loki endpoint. Requires:
#   - scw CLI authenticated to the right project
#   - SCW_COCKPIT_LOG_TOKEN: a Cockpit token with read_only_logs scope
#       (create with: scw cockpit token create name=visio-stats token-scopes.0=read_only_logs)
#   - jq + curl
#
# Flags:
#   -v, --verbose   also list each created room (time + slug), oldest first
#
# Optional env:
#   FUNCTION_NAME   (default: slash-visio)
#   LOG_SELECTOR    full Loki selector override

VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    -v|--verbose) VERBOSE=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

: "${SCW_COCKPIT_LOG_TOKEN:?Set SCW_COCKPIT_LOG_TOKEN — create one with: scw cockpit token create name=visio-stats token-scopes.0=read_only_logs}"

FUNCTION_NAME="${FUNCTION_NAME:-slash-visio}"

LOKI_URL="$(scw cockpit data-source list types.0=logs origin=scaleway -o json \
  | jq -r '.[0].url // empty')"
if [[ -z "$LOKI_URL" ]]; then
  echo "no Scaleway logs data source in current project" >&2
  exit 1
fi

# Filter on the slug prefix: every invocation's log emits one line containing
# "pdi-…", regardless of whether the handler logs JSON or a pretty-printed
# object. count_over_time is unreliable in Scaleway's Loki when combined with
# line filters, so we fetch the raw lines and bucket them client-side.
if [[ -z "${LOG_SELECTOR:-}" ]]; then
  FUNCTION_ID="$(scw function function list name="${FUNCTION_NAME}" -o json \
    | jq -r '.[0].id // empty')"
  if [[ -z "$FUNCTION_ID" ]]; then
    echo "couldn't find function '${FUNCTION_NAME}'" >&2
    exit 1
  fi
  SELECTOR="{resource_id=\"${FUNCTION_ID}\"} |= \"pdi-\""
else
  SELECTOR="$LOG_SELECTOR"
fi

NOW=$(date +%s)
START=$(( NOW - 24 * 3600 ))

RESP="$(curl -fsS -G \
  -H "X-Token: ${SCW_COCKPIT_LOG_TOKEN}" \
  --data-urlencode "query=${SELECTOR}" \
  --data-urlencode "start=${START}" \
  --data-urlencode "end=${NOW}" \
  --data-urlencode "limit=5000" \
  --data-urlencode "direction=forward" \
  "${LOKI_URL%/}/loki/api/v1/query_range")"

if [[ "$(jq -r '.status' <<<"$RESP")" != "success" ]]; then
  echo "Loki query failed:" >&2
  jq . <<<"$RESP" >&2
  exit 1
fi

# Per-hour bucket counts, oldest → newest (24 buckets).
COUNTS=()
while IFS= read -r v; do
  COUNTS+=("$v")
done < <(
  jq -r --argjson now "$NOW" '
    [.data.result[]?.values[]?]
    | map(.[0] | tonumber / 1e9 | floor)
    | map(($now - .) / 3600 | floor)
    | map(select(. >= 0 and . < 24))
    | reduce range(0; 24) as $i ([]; . + [0]) as $zeros
    | reduce .[] as $h ($zeros; .[23 - $h] += 1)
    | .[]
  ' <<<"$RESP"
)

TOTAL=0
MAX=0
for c in "${COUNTS[@]}"; do
  TOTAL=$(( TOTAL + c ))
  if (( c > MAX )); then MAX=$c; fi
done

LEVELS=("·" "▁" "▂" "▃" "▄" "▅" "▆" "▇" "█")
SPARK=""
for c in "${COUNTS[@]}"; do
  if (( c == 0 )); then
    SPARK+="${LEVELS[0]}"
  else
    if (( MAX <= 1 )); then
      LVL=1
    else
      LVL=$(( 1 + (c - 1) * 7 / (MAX - 1) ))
    fi
    (( LVL < 1 )) && LVL=1
    (( LVL > 8 )) && LVL=8
    SPARK+="${LEVELS[$LVL]}"
  fi
done

echo "${TOTAL} /visio calls in the last 24h"
echo "${SPARK}"

if (( VERBOSE )); then
  echo
  jq -r '
    [.data.result[]?.values[]?]
    | sort_by(.[0] | tonumber)
    | .[]
    | ((.[0] | tonumber / 1e9) | strflocaltime("%H:%M")) as $time
    | (.[1] | [match("pdi-[a-z0-9]{4}-[a-z0-9]{3}")] | (.[0].string // "?")) as $slug
    | "  \($time)  \($slug)"
  ' <<<"$RESP"
fi
