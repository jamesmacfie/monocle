#!/usr/bin/env bash
# Fetch suggestions for the active tab. No arg = root list; an arg = query search.
# Usage: ./03-suggestions.sh ["query"]
set -euo pipefail

PORT="${MONOCLE_BRIDGE_PORT:-8765}"
STATE_DIR="${TMPDIR:-/tmp}/monocle-bridge-test"
TOKEN="$(cat "$STATE_DIR/token" 2>/dev/null)" || { echo "pair first: ./01-pair.sh then ./02-confirm.sh"; exit 1; }
QUERY="${1:-}"

if [ -n "$QUERY" ]; then
  REQ="{\"v\":1,\"id\":\"s\",\"method\":\"suggestions/search-active-tab\",\"params\":{\"query\":\"$QUERY\"}}"
else
  REQ='{"v":1,"id":"s","method":"suggestions/get-for-active-tab","params":{"limit":20}}'
fi

curl -sS "127.0.0.1:$PORT" -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -d "$REQ" \
  | { command -v python3 >/dev/null && python3 -m json.tool || cat; }
