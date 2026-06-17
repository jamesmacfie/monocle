# Native Messaging Bridge

> **Status: proposed (v1 design).** This folder specifies a not-yet-built
> feature. Nothing here is shipped behavior. Treat it as the agreed design to
> implement against, not as a description of current code.

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

Explicitly **out of v1**:

- Executing commands through the bridge (suggestions are read-only).
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
7. [roadmap.md](./roadmap.md) — phasing and open questions.

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
