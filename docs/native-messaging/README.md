# Native Messaging Bridge

> **Status: extension side implemented; bridge app M0+M1 built (macOS).** The
> Monocle-side bridge is built as the `native-messaging` feature module
> (`apps/extension/background/features/nativeMessaging/`): opt-in toggle,
> enable/disable commands, `connectNative` port + reconnect, protocol validation,
> auth/scope dispatch, pairing, hashed bearer tokens with per-client Revoke,
> active-tab suggestions/search/children, and **v2 command execution**
> (`commands/execute`) behind the global Allow-execution opt-in. The native host
> is in-repo at `apps/bridge` (Tauri, macOS M0+M1): a persistent daemon owns
> `127.0.0.1:8765` + `~/.monocle/bridge.sock`, and a browser-spawned relay pumps
> stdio⇄UDS. Headless HTTP/UDS relay tests pass; still open are the real
> browser→relay→daemon round-trip, Chrome `key` pin, signing/notarization, and
> Windows/Linux support.

The **native messaging bridge** lets an external desktop application — the first
target is a Raycast extension — ask Monocle for the command-palette suggestions
relevant to the **currently active browser tab**, the same list a user sees when
they open the palette on that page. It is the integration seam between Monocle
and the desktop.

A browser extension built on Manifest V3 **cannot open a listening socket**, so
it cannot be a server an external app dials into. The only sanctioned channels
out of an MV3 service worker are outbound `fetch`/WebSocket connections and
**native messaging**. This design uses native messaging: a small native binary
(the "host") is auto-launched by the browser when the extension calls
`chrome.runtime.connectNative`, and that host also runs a loopback HTTP server
the external app calls.

```text
┌────────────┐   HTTP loopback    ┌─────────────────┐   UDS frames   ┌──────────────┐   stdio   ┌─────────────────────┐
│ external   │ ─────────────────▶ │ bridge daemon   │ ─────────────▶ │ relay mode   │ ────────▶ │ Monocle background  │
│ app        │ ◀───────────────── │ apps/bridge     │ ◀───────────── │ connectNative│ ◀──────── │ service worker      │
│ (Raycast)  │  JSON response     │                 │                │ child        │           │                     │
└────────────┘                    └─────────────────┘                └──────────────┘           └─────────────────────┘
```

The bridge app is a dumb relay with a transport gate: the daemon owns the
loopback HTTP server and injects the bearer token from the `Authorization`
header; the relay is spawned by the browser and pumps bytes between stdio and
the daemon's UDS. All real work — resolving the active tab, building suggestions,
pairing, auth policy, and command execution — happens in the extension's
background worker, reusing the existing command-query and execution code.

## Built scope

In scope today:

- Active-tab suggestions: root list (`suggestions/get-for-active-tab`),
  query-driven search (`suggestions/search-active-tab`), and nested
  group/search navigation (`suggestions/get-children`).
- Command execution (`commands/execute`) with `commands:execute` scope plus the
  global Allow-execution opt-in. See [execution.md](./execution.md).
- Opt-in: the bridge is **off by default**; a settings toggle must be enabled
  before the extension will call `connectNative` or accept any pairing.
- Bluetooth-style pairing with per-client bearer tokens (see
  [authentication-and-security.md](./authentication-and-security.md)).
- One reachable browser instance from the caller's point of view (see
  [multi-instance.md](./multi-instance.md)).

Known gaps:

- Site-SDK (`window.Monocle`) commands — they need a content-script sender the
  bridge does not have; see [architecture.md](./architecture.md).
- Incognito / private windows — excluded.
- Multi-instance selection (Chrome **and** Firefox, multiple profiles/channels
  running at once). The daemon can accept relays, but the caller cannot choose a
  browser/profile yet.
- Pairing fallback page for tabs without a `SurfaceHost`.

## Reading order

1. [architecture.md](./architecture.md) — components, transport, data flow, and
   where the bridge plugs into the existing command query.
2. [native-host.md](./native-host.md) — the native binary: manifests,
   per-OS registration, stdio framing, and the loopback server.
3. [protocol.md](./protocol.md) — the request/response wire protocol and the
   public `ExternalSuggestion` DTO.
4. [authentication-and-security.md](./authentication-and-security.md) — opt-in,
   pairing, tokens, and the loopback threat model.
5. [multi-instance.md](./multi-instance.md) — the multiple-host problem, the v1
   assumption, and the v2 instance registry.
6. [extension-integration.md](./extension-integration.md) — concrete Monocle
   wiring: the feature module, reuse points, manifest changes, files to touch.
7. [execution.md](./execution.md) — implemented v2 command execution through the
   bridge: per-command opt-out, focus model, bridge policy, and result channel.
8. [bridge-app-prd.md](./bridge-app-prd.md) — PRD for the **bridge app**: the
   downloadable cross-platform (Tauri) tray/menu-bar host that ships the relay
   to users — the persistent-daemon-plus-connectNative-relay design, the minimal
   tray UI, and per-OS manifest registration + signing.
9. [roadmap.md](./roadmap.md) — phasing and open questions.

## The client

- [../raycast/README.md](../raycast/README.md) — the Raycast extension client
  that consumes this protocol: the client view of pairing, suggestions,
  nested-group navigation, and execution. The shared TypeScript wire contract is
  `packages/native-bridge-protocol`; this folder remains the behavioral
  protocol authority, and the Raycast folder is the consumer.

## Related docs

- [../architecture.md](../architecture.md) — runtime modes and background
  ownership boundaries.
- [../messaging.md](../messaging.md) — the in-extension message protocol the
  bridge mirrors.
- [../features.md](../features.md) — the feature-module registry this bridge is
  built on.
- [../surfaces.md](../surfaces.md) — the modal primitive the pairing prompt uses.
- [../store-submission.md](../store-submission.md) — the `nativeMessaging`
  permission's review implications.
