# @monocle/bridge

The Monocle Bridge — a macOS menu-bar app (Tauri) that relays the native-messaging
wire protocol between the browser extension and an external caller (e.g. Raycast).

It is a **dumb relay with a tray icon**: it holds no Monocle logic, carries the
protocol verbatim, and routes by request `id` only. All real decisions (active
tab, suggestions, pairing, tokens) live in the extension.

Design: [`docs/native-messaging/bridge-app-prd.md`](../../docs/native-messaging/bridge-app-prd.md).
Scope today: **macOS, milestones M0 + M1** (Windows/Linux, signing, multi-browser
are deferred — see the PRD).

## One binary, two modes

`src-tauri/src/main.rs` branches before the Tauri runtime starts:

- **Daemon** (you launch it / login item): tray UI, loopback HTTP server on
  `127.0.0.1:8765`, and a Unix-domain-socket listener for relays. Persists until quit.
- **Relay** (the browser spawns it via `connectNative`): a pure byte pump between
  the browser's stdio and the daemon's UDS. No GUI. Detected by the browser-appended
  argv (`chrome-extension://…` / `…com.monocle.bridge.json`), or `--relay`.

Routing lives in the daemon (`daemon.rs`): it injects the `Authorization: Bearer`
token into the envelope, frames it to the browser, and matches the reply by `id`.

## Develop

```bash
pnpm dev:bridge      # from repo root — runs `tauri dev` (daemon mode)
pnpm build:bridge    # bundles the .app/.dmg

# inside apps/bridge/src-tauri:
cargo test           # framing round-trip + id-routing
```

**The menu-bar (tray) icon only appears from the bundled `.app`,** not from the
bare `tauri dev` binary — a `cargo run` process has no bundle id / `Info.plist`,
so macOS won't reliably place an `NSStatusItem`. For anything visual, run the
bundle:

```bash
open "src-tauri/target/release/bundle/macos/Monocle Bridge.app"
```

`tauri dev` is still fine for iterating on the daemon/relay logic (the loopback
server and UDS run regardless of the tray).

### Environment overrides (dev)

- `MONOCLE_BRIDGE_PORT` — loopback port (default `8765`); sidesteps a port
  already held by another instance.
- `MONOCLE_BRIDGE_HEADLESS=1` — run the daemon servers **without** Tauri/the tray
  (for tests, CI, and a future headless host). This is how the HTTP + relay path
  is verified without a GUI session.
- `MONOCLE_CHROME_EXTENSION_ID` — see below.

On launch the daemon registers `com.monocle.bridge.json` for every installed
supported browser. **Firefox** works out of the box (stable add-on id). **Chrome**
needs the extension id (unstable for dev loads, unpinned in `wxt.config.ts`):

```bash
export MONOCLE_CHROME_EXTENSION_ID=<id-from-chrome://extensions>
# or ~/.monocle/bridge-config.json : { "chromeExtensionId": "<id>" }
```

Without it, Chrome registration is skipped (Firefox still works).

## Verify end-to-end

Run the daemon, enable the bridge in the browser extension, then drive the
loopback server as the external caller (Raycast) would — `POST`ing protocol
envelopes to `127.0.0.1:8765`. See [`docs/native-messaging/protocol.md`](../../docs/native-messaging/protocol.md)
for the methods: `meta/info`, `pair/request` → `pair/submit-code`,
`suggestions/get-for-active-tab`, `suggestions/get-children`, `commands/execute`.
