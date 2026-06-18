#!/usr/bin/env bash
# Register the test host so Chrome will launch it on connectNative.
# Usage: ./00-install.sh <chrome-extension-id>
#   (grab the id from chrome://extensions with the extension loaded)
set -euo pipefail

EXT_ID="${1:?usage: ./00-install.sh <chrome-extension-id>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_JS="$DIR/monocle-test-host.js"

NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "node not found on PATH"; exit 1; }

# Chrome launches native hosts with a minimal PATH (no nvm), so `#!/usr/bin/env
# node` can fail to find node. Point the manifest at a launcher that execs the
# ABSOLUTE node binary — no PATH dependency.
LAUNCHER="$DIR/monocle-test-host-launcher.sh"
cat > "$LAUNCHER" <<EOF
#!/bin/sh
exec "$NODE_BIN" "$HOST_JS" "\$@"
EOF
chmod +x "$LAUNCHER" "$HOST_JS"

# macOS Chrome. For Chrome Canary / Chromium / Firefox, see the table in
# docs/native-messaging/native-host.md and change/add directories.
#
# A native-messaging manifest is read from the dir of the EXACT Chrome that runs
# the extension. You may have several channels installed — and `pnpm dev:chrome`
# (WXT) usually launches "Chrome for Testing", not Chrome stable. So write the
# manifest into every Chrome-family support dir that exists; harmless extras.
BASE="$HOME/Library/Application Support"
CHROME_DIRS=(
  "$BASE/Google/Chrome"
  "$BASE/Google/Chrome Beta"
  "$BASE/Google/Chrome Dev"
  "$BASE/Google/Chrome Canary"
  "$BASE/Google/Chrome for Testing"
  "$BASE/Google/ChromeForTesting"
  "$BASE/Chromium"
)

WRITTEN=0
for dir in "${CHROME_DIRS[@]}"; do
  [ -d "$dir" ] || continue   # only channels that have been run
  mkdir -p "$dir/NativeMessagingHosts"
  cat > "$dir/NativeMessagingHosts/com.monocle.bridge.json" <<EOF
{
  "name": "com.monocle.bridge",
  "description": "Monocle test host",
  "path": "$LAUNCHER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
  echo "Installed: $dir/NativeMessagingHosts/com.monocle.bridge.json"
  WRITTEN=$((WRITTEN + 1))
done

[ "$WRITTEN" -gt 0 ] || { echo "No Chrome-family support dirs found under $BASE/Google"; exit 1; }
echo "Launcher:  $LAUNCHER  (node: $NODE_BIN)"
echo
echo "Next:"
echo "  1. FULLY QUIT the dev Chrome (Cmd-Q) and relaunch it — Chrome caches the"
echo "     native-host manifest list, so a new manifest needs a restart."
echo "  2. Run the PALETTE command \"Enable native bridge\" and click Grant"
echo "     (grants nativeMessaging + tabs AND opens the port). The settings-page"
echo "     toggle alone does NOT grant the permission."
echo "  3. ./04-meta.sh   then   ./01-pair.sh"
