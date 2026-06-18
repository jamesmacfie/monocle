#!/usr/bin/env bash
# Begin pairing. A 6-digit code modal should appear on your active browser tab.
set -euo pipefail

PORT="${MONOCLE_BRIDGE_PORT:-8765}"
STATE_DIR="${TMPDIR:-/tmp}/monocle-bridge-test"
mkdir -p "$STATE_DIR"

REQ='{"v":1,"id":"pair","method":"pair/request","params":{"client":{"name":"bash","instanceId":"dev-1"}}}'
RESP="$(curl -sS "127.0.0.1:$PORT" -H 'content-type: application/json' -d "$REQ")" || {
  echo "Could not reach the host on 127.0.0.1:$PORT."
  echo "Is the bridge enabled in the extension? (palette: \"Enable native bridge\")"
  exit 1
}

echo "$RESP"
PAIRING_ID="$(printf '%s' "$RESP" | sed -n 's/.*"pairingId":"\([^"]*\)".*/\1/p')"
[ -n "$PAIRING_ID" ] || { echo; echo "No pairingId in response (see error above)."; exit 1; }

printf '%s' "$PAIRING_ID" > "$STATE_DIR/pairingId"
echo
echo "Read the 6-digit code from the browser modal, then:"
echo "  ./02-confirm.sh <code>"
