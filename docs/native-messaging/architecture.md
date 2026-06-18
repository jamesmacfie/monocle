# Bridge architecture

> **Status: extension side implemented; bridge host built at `apps/bridge`
> (macOS M0+M1).** This document is the design/contract; the canonical build
> status lives in [README.md](./README.md) and the project `CLAUDE.md`.

This document describes the three components of the bridge, why native messaging
is the transport, the service-worker lifecycle constraints, and the end-to-end
flow of a single suggestions request — terminating in the existing command-query
code so the bridge stays a thin adapter rather than a parallel implementation.

---

## Components

| Component | Where it runs | Responsibility |
| --- | --- | --- |
| **External app** | Desktop (Raycast) | Initiates pairing, holds the bearer token, sends JSON requests to the loopback port, renders the returned suggestions. |
| **Native host** | A native child process the browser launches | Owns the loopback HTTP server **and** the stdio pipe to the extension. Relays JSON between them, enforces transport-level rules (method, content-type, `Origin` rejection). Holds no Monocle logic. |
| **Extension background** | Monocle's MV3 service worker | Calls `connectNative`, authenticates requests, resolves the active tab, builds suggestions by reusing `getCommands` / the search index, maps them to the public DTO, and drives the pairing modal. |

The split matters: the host is deliberately ignorant. It cannot read tabs, build
suggestions, or decide pairing — it only moves bytes and rejects obviously
illegitimate callers. Every decision that touches Monocle data lives in the
background worker, behind the same validation the in-extension message router
already applies.

---

## Why native messaging

An MV3 service worker has no `net.Server` equivalent — it cannot accept inbound
connections. Three options exist for reaching it from outside the browser:

1. **Native messaging** — the browser launches a registered native binary and
   exchanges JSON over stdio. The binary is the only part that can hold a
   loopback socket. Officially supported on Chrome, Edge, and Firefox.
2. A standalone always-on daemon both the extension and the app connect to.
   Cleaner for multiple browsers but needs separate install + lifecycle
   management (a launchd/login item).
3. The extension polling a remote server — unacceptable latency and a network
   round trip for local data.

Native messaging wins for v1: the browser manages the host's lifecycle (no
separate daemon to install and keep alive), and the `allowed_origins` /
`allowed_extensions` manifest field cryptographically ties the host to *this*
extension. Its one weakness — one host process per browser — is the subject of
[multi-instance.md](./multi-instance.md).

See [native-host.md](./native-host.md) for the host manifest, registration, and
framing details.

---

## Service-worker lifecycle

MV3 service workers are terminated when idle. Two facts shape the design:

- Calling `runtime.connectNative()` and holding the returned `Port` **keeps the
  worker alive** for as long as the port is open, and inbound port messages
  reset the idle timer. The bridge relies on this: the persistent host port is
  what keeps the background responsive to app requests. (Chrome documents this
  in the service-worker lifecycle guide.)
- The host can die or be killed independently. The extension must listen for
  `port.onDisconnect` and **reconnect** (with backoff) whenever the bridge is
  still enabled. A dropped port must never silently leave the bridge dead.

The port is only opened when the opt-in setting is on (see
[extension-integration.md](./extension-integration.md)); disabling the feature
disconnects it and lets the worker idle normally.

---

## End-to-end flow: `suggestions/get-for-active-tab`

1. The app sends an authenticated `POST` to `127.0.0.1:<port>` with its bearer
   token and the request envelope.
2. The native host validates transport rules (method `POST`, JSON content-type,
   no browser `Origin`), then writes the JSON to stdout (stdio framing) to the
   extension's port.
3. The background `port.onMessage` handler:
   - **Authenticates** the token (hash compare, scope check — see
     [authentication-and-security.md](./authentication-and-security.md)).
   - **Resolves the active tab** with
     `chrome.tabs.query({ active: true, currentWindow: true })`. This requires
     the optional **`tabs`** permission, because the request is not a user
     gesture and `activeTab` does not apply; `url` and `title` are
     sensitive tab properties Chrome only exposes under `tabs`. Incognito
     windows are skipped unless explicitly enabled.
   - Builds a `Browser.Context` (`shared/types/browser.ts`):
     `{ url, title, modifierKey: null }`.
   - Calls `getCommands(context)` (`background/commands/index.ts`) →
     `getCommandCollections()` (`background/commands/query.ts`) for
     `{ favorites, suggestions }`, then `commandsToSuggestions(commands, context)`
     (`background/commands/suggestions.ts`).
   - **Maps** the resulting internal `Suggestion[]` to the public
     `ExternalSuggestion[]` DTO (see [protocol.md](./protocol.md)) — the internal
     `Suggestion` type is never sent over the wire.
4. The background posts the response back over the port; the host frames it back
   onto the HTTP response.

`suggestions/search-active-tab` is identical except step 3 routes through the
search path (the `monocle-commands-search` handler + `background/commands/searchIndex.ts`
scoring) with the app-supplied query.

---

## The site-SDK gap (deliberate v1 exclusion)

The in-extension `monocle-commands-get` handler (`background/messages/getCommands.ts`)
derives site-SDK scope from the **message sender** — the content script that owns
the page's `window.Monocle` registrations. A native-host request has **no
content-script sender**, so page-owned SDK commands cannot be resolved and are
absent from bridge results.

v1 accepts this and documents it: bridge suggestions are the privileged,
background-owned command set for the active URL, **minus** site-SDK commands. v2
may reconstruct a top-frame tab scope (look up the active tab's top frame and ask
it for its SDK registrations) to close the gap. Until then, do not claim bridge
results are byte-identical to the palette.

---

## Related docs

- [native-host.md](./native-host.md) — the binary and its transport.
- [protocol.md](./protocol.md) — request/response shapes and the DTO.
- [extension-integration.md](./extension-integration.md) — the background wiring.
- [../architecture.md](../architecture.md) — overall background ownership model.
