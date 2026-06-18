# Bridge and extension prerequisites

> **Status: design-only.** This doc is about dependencies, not new work.

## No protocol or bridge changes are required

The bridge contract already covers everything the Raycast extension needs:

- Read suggestions: `suggestions/get-for-active-tab`, `suggestions/search-active-tab`.
- Nested navigation: `suggestions/get-children` (already merged on the extension side).
- Execute + return values: `commands/execute` with `{ ran, focused?, value?, contentType? }`.
- Pairing + auth: `pair/request` / `pair/submit-code`, bearer tokens, scopes.

So building the Raycast extension touches **no** code in `apps/bridge` or
`apps/extension/background/features/nativeMessaging/`. It is a new isolated app plus the user-side
toggles below.

## What the user/dev must have in place

For the extension to actually return suggestions and run commands, these must be true at runtime:

1. **Monocle Bridge app installed and running** (`apps/bridge`). It owns the loopback server on
   `127.0.0.1:8765` and writes `~/.monocle/bridge.json`. Without it, the client's `fetch` gets
   `ECONNREFUSED`.
2. **The bridge feature enabled in the extension.** It is **off by default**. The user enables it in
   the extension's settings (this also requests the `nativeMessaging` + `tabs` permissions). While
   off, pairing and suggestion calls return `not_enabled`.
3. **Paired** (once). See [pairing.md](./pairing.md). Pairing requires the browser to be open so the
   code modal can show.
4. **For execution only:** the global **Allow command execution** opt-in toggled on in the extension
   settings. Off by default. While off, `commands/execute` returns `execution_disabled` even though
   the token carries the `commands:execute` scope. Probe `meta/info.executionEnabled` to reflect
   this in the UI ([execution.md](./execution.md)).

## Caveats inherited from the bridge (not client work, but worth knowing)

- **Commands return values only if annotated.** A command returns a `value` over the bridge only if
  its definition sets `external.result: "value"` (and `focusBrowser` for focus-and-act). Annotating
  the full catalog is **ongoing extension-side work** — see
  [`../native-messaging/execution.md`](../native-messaging/execution.md). Until a given command is
  annotated, `commands/execute` still runs it (`ran:true`) but won't return data / raise the window.
  The client should treat a missing `value`/`focused` as the "silent side-effect" shape, not a bug.
- **Chrome `key` pin / dev-load.** On Firefox the host manifest's allowed-extension id is stable. On
  Chrome the extension id isn't pinned yet, so the native-host manifest's `allowed_origins` may not
  match an unpacked dev build until a `key` is set
  ([`../native-messaging/extension-integration.md`](../native-messaging/extension-integration.md),
  [`../native-messaging/roadmap.md`](../native-messaging/roadmap.md)). If the bridge "won't connect"
  on Chrome dev builds, this is usually why — not a Raycast issue.
- **Multi-instance is v1 first-to-bind.** If two browsers run relays, only one owns port 8765. The
  Raycast client reaches whoever owns the port; it cannot choose. Use `status` / `meta/info` to show
  *which* browser answered. Selection across instances is a v2 item
  ([`../native-messaging/multi-instance.md`](../native-messaging/multi-instance.md)).
- **Pairing code visibility depends on a Monocle surface host.** The current extension shows the
  code through a `modal` surface, not a dedicated pairing page. If the active browser page cannot run
  Monocle UI (`chrome://*`, store/add-on pages, discarded tabs), the user must switch to a normal tab
  or Monocle new tab and restart pairing. That is an extension-side gap, not Raycast client logic.
- **Site-SDK commands absent**; **incognito excluded**. Both are documented v1 gaps
  ([architecture.md](./architecture.md)).

## Quick "is the environment ready?" sequence

The client can self-diagnose on startup:

1. `GET /status` (daemon) reachable? No → "Start the Monocle Bridge app." (`ECONNREFUSED`)
2. `status.connected` / `meta/info.bridgeEnabled` true? No → "Open your browser and enable the
   Monocle bridge."
3. Token in `LocalStorage`? No → prompt to pair.
4. Pairing started but no code visible? → "Switch to a normal browser tab or Monocle new tab and
   restart pairing."
5. Want to run commands and `meta/info.executionEnabled` false? → "Enable *Allow command execution*
   in Monocle settings."
