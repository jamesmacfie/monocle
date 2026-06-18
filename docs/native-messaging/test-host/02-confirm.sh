#!/usr/bin/env bash
# Submit the code from the browser modal. On success, saves the bearer token.
# Usage: ./02-confirm.sh <6-digit-code>
set -euo pipefail

CODE="${1:?usage: ./02-confirm.sh <6-digit-code>}"
PORT="${MONOCLE_BRIDGE_PORT:-8765}"
STATE_DIR="${TMPDIR:-/tmp}/monocle-bridge-test"
PAIRING_ID="$(cat "$STATE_DIR/pairingId" 2>/dev/null)" || { echo "run ./01-pair.sh first"; exit 1; }

REQ="{\"v\":1,\"id\":\"confirm\",\"method\":\"pair/submit-code\",\"params\":{\"pairingId\":\"$PAIRING_ID\",\"code\":\"$CODE\"}}"
RESP="$(curl -sS "127.0.0.1:$PORT" -H 'content-type: application/json' -d "$REQ")"
echo "$RESP"

TOKEN="$(printf '%s' "$RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
[ -n "$TOKEN" ] || { echo; echo "No token — wrong/expired code, or attempt cap hit. Re-run ./01-pair.sh."; exit 1; }

printf '%s' "$TOKEN" > "$STATE_DIR/token"
echo
echo "Token saved. Now:"
echo "  ./03-suggestions.sh              # root list for the active tab"
echo "  ./03-suggestions.sh \"close tab\"   # query search"
