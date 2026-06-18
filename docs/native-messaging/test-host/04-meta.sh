#!/usr/bin/env bash
# Unauthenticated discovery: meta/info + status. Handy to confirm the host is up
# and the bridge reports enabled, before pairing.
set -euo pipefail

PORT="${MONOCLE_BRIDGE_PORT:-8765}"
fmt() { command -v python3 >/dev/null && python3 -m json.tool || cat; }

echo "== meta/info =="
curl -sS "127.0.0.1:$PORT" -H 'content-type: application/json' \
  -d '{"v":1,"id":"m","method":"meta/info"}' | fmt
echo
echo "== status =="
curl -sS "127.0.0.1:$PORT" -H 'content-type: application/json' \
  -d '{"v":1,"id":"st","method":"status"}' | fmt
