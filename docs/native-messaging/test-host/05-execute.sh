#!/usr/bin/env bash
# Run a command on the active tab via the bridge (v2 execution).
# Usage: ./05-execute.sh <command-id>
#   Find ids with ./03-suggestions.sh. Examples:
#     ./05-execute.sh copy-current-url      # data-returning → result.value = URL
#     ./05-execute.sh reload-current-tab    # silent → { ran: true }
#     ./05-execute.sh reopen-last-closed-tab # focus-and-act → focused: true
#
# Prerequisite: turn ON "Allow paired apps to run commands" on the Native Bridge
# settings page (it is OFF by default). Without it you get execution_disabled.
set -euo pipefail

ID="${1:?usage: ./05-execute.sh <command-id>}"
PORT="${MONOCLE_BRIDGE_PORT:-8765}"
STATE_DIR="${TMPDIR:-/tmp}/monocle-bridge-test"
TOKEN="$(cat "$STATE_DIR/token" 2>/dev/null)" || {
  echo "pair first: ./01-pair.sh then ./02-confirm.sh <code>"
  exit 1
}

REQ="{\"v\":1,\"id\":\"x\",\"method\":\"commands/execute\",\"params\":{\"id\":\"$ID\"}}"
curl -sS "127.0.0.1:$PORT" -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -d "$REQ" \
  | { command -v python3 >/dev/null && python3 -m json.tool || cat; }
