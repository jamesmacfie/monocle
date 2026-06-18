# Local test host (throwaway)

A minimal native-messaging host + scripts to exercise the bridge end-to-end on
**macOS + Chrome**. This is NOT the real host (which lives outside this repo) —
it is just enough to pair and fetch suggestions from a terminal.

## Run in order

```bash
chmod +x *.sh monocle-test-host.js   # once

# 1. Load the extension (pnpm dev:chrome), copy its id from chrome://extensions
./00-install.sh <chrome-extension-id>

# 2. In the extension, run the PALETTE command "Enable native bridge" and click
#    Grant. This grants nativeMessaging + tabs AND opens the port.
#    NOTE: the settings-page toggle alone enables the flag but does NOT grant
#    the permission, so the port never opens — use the palette command.

./04-meta.sh                 # optional: confirm host is up + bridgeEnabled:true
./01-pair.sh                 # a 6-digit code modal appears on the active tab
./02-confirm.sh 123456       # type the code you saw
./03-suggestions.sh          # root list for the active tab
./03-suggestions.sh "close tab"   # query search

# v2 execution — first turn ON "Allow paired apps to run commands" on the
# Native Bridge settings page (OFF by default), then:
./05-execute.sh copy-current-url       # data-returning → result.value = the URL
./05-execute.sh reload-current-tab     # silent → { ran: true }
./05-execute.sh reopen-last-closed-tab # focus-and-act → focused: true

./99-uninstall.sh            # clean up the manifest + saved token
```

## Things worth verifying

- Wait 60s before `02-confirm` → `pairing_expired`.
- 6 wrong codes → pairing clears (`pairing_rejected`); re-run `01-pair.sh`.
- Revoke the client on the options **Native Bridge** page → `03` returns
  `unauthorized`.
- Switch the active tab to `chrome://extensions` → `03` returns `no_active_tab`.
- Without the `authorization` header (edit `03` to drop it) → `unauthorized`.
- `./05-execute.sh open-settings` → `forbidden` (UI command, `external.allowed:false`).
- `./05-execute.sh clear-browser-data` → `forbidden` (confirmAction, always denied).
- With execution toggled OFF → `execution_disabled`.

Port is `8765` (override with `MONOCLE_BRIDGE_PORT`). Saved state lives in
`$TMPDIR/monocle-bridge-test`. Logs from the bridge itself: the extension's
service-worker console (`chrome://extensions` → Monocle → *Inspect views:
service worker*).

For other browsers/OSes, change the manifest directory in `00-install.sh` —
see [../native-host.md](../native-host.md).
