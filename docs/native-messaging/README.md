# Native Messaging Bridge

> **Status: v1 extension side implemented; bridge app M0+M1 built (macOS).** The
> relay host now lives in-repo at `apps/bridge` (Tauri daemon+relay; see
> [bridge-app-prd.md](./bridge-app-prd.md)) — built and verified headless on
> macOS, pending real-browser end-to-end + signing + cross-platform. The
> Monocle-side bridge is built as the `native-messaging` feature module
> (`apps/extension/background/features/nativeMessaging/`): the opt-in toggle +
> palette enable/disable commands, the `connectNative` port + reconnect, the
> request pump (envelope validation, auth, dispatch), bluetooth-style pairing
> (CSPRNG code, hashed/constant-time verify, attempt cap + expiry), scoped
> hashed bearer tokens with per-client Revoke, and the `Suggestion` →
> `ExternalSuggestion` mapper, all reusing `getCommands` / the search path /
> Surfaces. The **native host is now in-repo** at `apps/bridge` (macOS M0+M1),
> but the real browser→relay→daemon round-trip is not yet manually exercised
> (needs the extension loaded). The `nativeMessaging`/`tabs` optional
> permissions are wired; pinning a stable Chrome `key` is still open (see
> [extension-integration.md](./extension-integration.md)). v2 items (execution,
> multi-instance selection, site-SDK, signed requests) remain design-only.

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
┌────────────┐   POST 127.0.0.1:<port>   ┌──────────────┐   stdio (JSON)   ┌─────────────────────┐
│ external   │ ────────────────────────► │ native host  │ ◄──────────────► │ Monocle background  │
│ app        │ ◄──────────────────────── │ (the broker) │   connectNative  │ service worker      │
│ (Raycast)  │      JSON response        │              │      Port        │                     │
└────────────┘                           └──────────────┘                  └─────────────────────┘
```

The host is a dumb relay with an auth gate: it owns the loopback port and the
stdio pipe, and forwards JSON between them. All real work — resolving the active
tab, building suggestions, the pairing decision — happens in the extension's
background worker, reusing the existing command-query code.

## v1 scope

In scope:

- Read-only suggestions for the active tab: a root list
  (`suggestions/get-for-active-tab`) and a query-driven search
  (`suggestions/search-active-tab`).
- Opt-in: the bridge is **off by default**; a settings toggle must be enabled
  before the extension will call `connectNative` or accept any pairing.
- Bluetooth-style pairing with a per-client bearer token (see
  [authentication-and-security.md](./authentication-and-security.md)).
- A single reachable browser instance (see [multi-instance.md](./multi-instance.md)).

Explicitly **out of v1** (but **execution is now designed** for v2 — see
[execution.md](./execution.md)):

- Executing commands through the bridge (v1 suggestions are read-only).
- Site-SDK (`window.Monocle`) commands — they need a content-script sender the
  bridge does not have; see [architecture.md](./architecture.md).
- Incognito / private windows — excluded unless explicitly enabled.
- Multi-instance selection (Chrome **and** Firefox, multiple profiles/channels
  running at once). v1 assumes one instance; v2 adds selection.

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
7. [execution.md](./execution.md) — **v2 design**: executing commands through the
   bridge — the per-command opt-out, the focus model, the bridge policy, and the
   result channel.
8. [bridge-app-prd.md](./bridge-app-prd.md) — PRD for the **bridge app**: the
   downloadable cross-platform (Tauri) tray/menu-bar host that ships the relay
   to users — the persistent-daemon-plus-connectNative-relay design, the minimal
   tray UI, and per-OS manifest registration + signing.
9. [roadmap.md](./roadmap.md) — phasing and open questions.

## The client

- [../raycast/README.md](../raycast/README.md) — **design-only** build spec for the
  Raycast extension that consumes this protocol: the client view of pairing,
  suggestions, nested-group navigation, and execution. This folder is the
  protocol authority; the raycast folder is the consumer.

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
