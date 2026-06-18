#!/usr/bin/env bash
# Remove the host manifest and the saved pairing/token state.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$HOME/Library/Application Support"
for d in \
  "$BASE/Google/Chrome" "$BASE/Google/Chrome Beta" "$BASE/Google/Chrome Dev" \
  "$BASE/Google/Chrome Canary" "$BASE/Google/Chrome for Testing" \
  "$BASE/Google/ChromeForTesting" "$BASE/Chromium"; do
  M="$d/NativeMessagingHosts/com.monocle.bridge.json"
  [ -f "$M" ] && rm -f "$M" && echo "removed $M" || true
done
rm -f "$DIR/monocle-test-host-launcher.sh" && echo "removed launcher" || true
rm -rf "${TMPDIR:-/tmp}/monocle-bridge-test" && echo "removed saved state"
echo "Also run \"Disable native bridge\" in the extension to close the port."
