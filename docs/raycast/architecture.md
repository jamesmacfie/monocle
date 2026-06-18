# Architecture

> Describes how the implemented Raycast extension fits the existing bridge.
> Protocol authority: [`../native-messaging/`](../native-messaging/README.md).

## The four actors

```
┌──────────────────┐   HTTP (loopback)    ┌─────────────────────┐   UDS frames    ┌───────────┐   stdio   ┌──────────────────────┐
│ Raycast extension │ ───────────────────▶ │ Monocle Bridge       │ ──────────────▶ │  relay    │ ────────▶ │ Browser extension     │
│ (this folder)     │  127.0.0.1:8765      │ daemon (tray app)    │  ~/.monocle/    │ (spawned  │           │ nativeMessaging       │
│                   │ ◀─────────────────── │  apps/bridge          │ ◀────────────── │  by       │ ◀──────── │  feature              │
└──────────────────┘  JSON response       └─────────────────────┘  bridge.sock    └───────────┘           └──────────┬───────────┘
                                                                                                                       │ resolves
                                                                                                                       ▼
                                                                                                              ┌──────────────────┐
                                                                                                              │   active tab      │
                                                                                                              └──────────────────┘
```

1. **Raycast extension** (what we build). A Node process. Holds the bearer token, builds request
   envelopes, renders suggestions, owns the pairing UI and icon mapping. It speaks only HTTP to the
   loopback daemon.
2. **Bridge daemon** (`apps/bridge`, already built). A tray app owning the loopback HTTP server on
   `127.0.0.1:8765`. It is a dumb relay: injects the bearer token from the `Authorization` header
   into the envelope, frames the JSON to the browser, routes the reply back by envelope `id`. Holds
   no Monocle logic, no token at rest, no suggestions.
3. **Relay** (same binary, spawned by the browser via native messaging). Pumps frames between the
   browser's stdio and the daemon's Unix-domain socket.
4. **Browser extension** (`nativeMessaging` feature, already built). Authenticates the token,
   resolves the **active tab**, runs the same command query/search/execute paths the palette uses,
   and projects results to the public `ExternalSuggestion` DTO.

The Raycast extension only ever talks to actor 2. Everything below the loopback boundary is the
bridge's concern.

## Entry and exit points

These are the only supported component boundaries for the Raycast client:

| Boundary | Direction | Mechanism | Payload owner | Notes |
|---|---|---|---|---|
| Raycast → daemon | outbound from Raycast | `fetch("http://127.0.0.1:<port>/")` JSON `POST` | Raycast builds `{ v, id, method, params }`; daemon injects `auth.token` from the header | Do not set `Origin`; browser-origin requests are rejected. |
| Raycast → daemon health | outbound from Raycast | `GET /status` | daemon | Daemon liveness only: tells whether a relay/browser is connected. |
| Daemon → relay | internal bridge | UDS frame at `~/.monocle/bridge.sock` | daemon/relay | Raycast never opens this directly. |
| Relay → Monocle extension | browser native messaging | stdio frames from `connectNative("com.monocle.bridge")` | browser extension validates protocol | This is why the daemon remains a dumb relay instead of speaking browser APIs. |
| Monocle extension → active tab | internal extension APIs | active-tab resolution + command query/execute paths | Monocle extension | Raycast never sends a URL or tab id; it receives only the extension-projected DTO. |

The corresponding **data exits** are:

- **Raycast exit:** bearer token leaves Raycast only in the `Authorization` header to loopback.
- **Daemon exit:** the daemon forwards JSON frames by `id`; it never persists token/suggestion data.
- **Extension exit:** only `ExternalSuggestion[]`, status/capability results, and execute results
  leave the extension. Internal `CommandNode`, `Suggestion`, form state, and command executors do not
  cross the public boundary.

## What the Raycast extension owns vs must not do

| Owns | Must not do |
|------|-------------|
| Pairing UI + token storage (`LocalStorage`) | Re-implement any Monocle command logic |
| Building request envelopes, `id` generation | Decide what a command does — it only carries the command `id` |
| Rendering `ExternalSuggestion` → `List.Item` | Send an `Origin` header (the daemon rejects it → 403) |
| Mapping icon names → Raycast `Icon` | Persist suggestions long-term (they are active-tab-specific) |
| Navigation stack for nested groups | Assume which browser/profile is connected (v1: daemon has one active relay) |
| Result handling (clipboard, HUD, focus) | Store the token in plain preferences |

## End-to-end: search then execute

```
User opens "Search Monocle" in Raycast
  │
  ├─ extension reads token from LocalStorage; if absent → prompt to pair (pairing.md)
  │
  ├─ search box empty → POST suggestions/get-for-active-tab {limit, includeFavorites}
  │     (search box has text → POST suggestions/search-active-tab {query, limit})
  │  daemon injects Bearer token → relay → extension resolves active tab →
  │  getCommands/search → ExternalSuggestion[] → back to Raycast
  │
  ├─ Raycast renders List.Item per suggestion, icon-mapped, routed by `type`:
  │     group/search → Action.Push (drill in, see nested-navigation.md)
  │     action/submit → Action: execute
  │
  └─ user selects an action → POST commands/execute {id}
        extension preflights (policy/permission/platform/incognito) → runs command →
        { ran:true, focused?, value?, contentType? }
        Raycast: value present → Clipboard.copy + HUD; focused → browser raised; else success toast
```

The **active tab is resolved server-side** — Raycast never sends a URL. The suggestions you get are
always for whatever tab is frontmost in the connected browser at request time.

## Inherited caveats

- **Liveness.** The MV3 service worker can sleep; the bridge keeps a `connectNative` port open to
  hold it alive and reconnects with backoff. A request can still hit a moment where no browser is
  connected → the daemon returns `not_enabled` / "no browser connected". Treat it as transient
  (retry / show "browser not connected").
- **Single active relay (v1).** The daemon owns port 8765 and stores one active
  browser relay at a time; if another browser relay connects, it becomes the
  responder. Use `status` / `meta/info` to show which browser you reached. See
  [`../native-messaging/multi-instance.md`](../native-messaging/multi-instance.md).
- **Site-SDK absent.** Bridge requests have no content-script sender, so page-owned
  `window.Monocle` commands never appear in bridge results. Documented v1 gap.
- **Incognito excluded.** If the active tab is incognito/private, suggestion and execute calls
  return `no_active_tab`.
