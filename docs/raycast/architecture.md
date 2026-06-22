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

1. **Raycast extension** (what we build). A Node process. Holds per-browser bearer tokens, builds
   request envelopes, renders suggestions, owns the pairing UI and icon mapping. Speaks only HTTP to
   the loopback daemon.
2. **Bridge daemon** (`apps/bridge`, already built). A tray app owning the loopback HTTP server on
   `127.0.0.1:8765`. A dumb relay: injects the bearer token from the `Authorization` header
   into the envelope, frames the JSON to the browser, routes the reply back by envelope `id`. Holds
   no Monocle logic, no token at rest, no suggestions. It **tracks every connected relay** keyed by
   browser id and routes a request to the one named in the `X-Monocle-Target` header (see
   [Multi-browser](#multi-browser-which-browser-answers)).
3. **Relay** (same binary, spawned by the browser via native messaging). Pumps frames between the
   browser's stdio and the daemon's Unix-domain socket.
4. **Browser extension** (`nativeMessaging` feature, already built). Authenticates the token,
   resolves the **active tab**, runs the same command query/search/execute paths the palette uses,
   and projects results to the public `ExternalSuggestion` DTO.

The Raycast extension only ever talks to actor 2; everything below the loopback boundary is the
bridge's concern.

## Entry and exit points

These are the only supported component boundaries for the Raycast client:

| Boundary | Direction | Mechanism | Payload owner | Notes |
|---|---|---|---|---|
| Raycast → daemon | outbound from Raycast | `fetch("http://127.0.0.1:<port>/")` JSON `POST` | Raycast builds `{ v, id, method, params }`; daemon injects `auth.token` from the header | Do not set `Origin`; browser-origin requests are rejected. |
| Raycast → daemon health | outbound from Raycast | `GET /status` | daemon | Daemon liveness only: tells whether any relay/browser is connected. |
| Raycast → daemon instance list | outbound from Raycast | `GET /instances` | daemon | The connected browsers (id/name/channel/version), cached at the connect handshake — no browser round-trip. Drives the browser picker. |
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
| Pairing UI + per-browser token storage (`LocalStorage`) | Re-implement any Monocle command logic |
| Building request envelopes, `id` generation | Decide what a command does — it only carries the command `id` |
| Rendering `ExternalSuggestion` → `List.Item` | Send an `Origin` header (the daemon rejects it → 403) |
| Mapping icon names → Raycast `Icon` | Persist suggestions long-term (they are active-tab-specific) |
| Navigation stack for nested groups | Store the token in plain preferences |
| Choosing the target browser (picker + `X-Monocle-Target`) | Assume a browser/profile beyond browser-type identity (profiles collapse — see Multi-browser) |
| Result handling (clipboard, HUD, focus) | |

## Multi-browser: which browser answers

The daemon tracks **all** currently connected relays, keyed by browser id (the
browser type, e.g. `"chrome"`/`"firefox"`). It learns each relay's identity at
connect time via an unauthenticated `meta/info` handshake (no extension change),
so it can list and route without waking the browser. Routing is a pure function
(`select_relay` in `apps/bridge/src-tauri/src/daemon.rs`):

- `X-Monocle-Target` header absent **+ one browser** → that browser.
- absent **+ ≥2 browsers** → `bad_request` ("specify a target browser").
- header names an unknown/closed browser → `not_enabled`.
- none connected → `not_enabled`.

The Raycast client (`src/lib/bridge.ts`) drives this:

- `listInstances()` calls `GET /instances` and returns the connected browsers
  (`[]` if the daemon is unreachable — so "app off" and "no browsers" look the
  same: nothing to target).
- Both entry points (`search-monocle.tsx`, `pair-monocle.tsx`) branch on the
  count: **0** → "No browser connected" empty view; **1** → go straight to that
  browser (no picker); **≥2** → render `BrowserPicker`, and selecting one opens
  that browser's view.
- Every `bridgeRequest` passes the chosen `target` (the browser id), which the
  client sets as the `X-Monocle-Target` header.

**Tokens are per-browser.** A token minted by one browser's extension is only
valid there, so `auth.ts` keys them as `monocle.token.<browserId>`; the client
pairs each browser on demand. A one-time `migrateLegacyToken` claims a
pre-multi-browser single token for the sole browser when exactly one is connected
(existing users don't re-pair). See [pairing.md](./pairing.md).

> Identity is **browser-type-only**: multiple profiles/channels of the same
> browser collapse to one id and the last relay to connect wins. Profile-level
> instance selection is deferred —
> [`../native-messaging/multi-instance.md`](../native-messaging/multi-instance.md).

## End-to-end: search then execute

```
User opens "Search Monocle" in Raycast
  │
  ├─ GET /instances → 0: empty view · 1: that browser · ≥2: BrowserPicker (pick one → target)
  │
  ├─ extension reads that browser's token from LocalStorage; if absent → prompt to pair (pairing.md)
  │
  ├─ search box empty → POST suggestions/get-for-active-tab {limit, includeFavorites}
  │     (search box has text → POST suggestions/search-active-tab {query, limit})
  │  daemon injects Bearer token, routes by X-Monocle-Target → relay → extension
  │  resolves active tab → getCommands/search → ExternalSuggestion[] → back to Raycast
  │
  ├─ Raycast renders List.Item per suggestion, icon-mapped, routed by `type`:
  │     group/search → Action.Push (drill in, see suggestions-and-navigation.md)
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

These come from the bridge/extension, not the Raycast client, but shape what the
client can show. (Setup-time runtime prerequisites — bridge running, feature
enabled, paired, execution opt-in — live in [setup.md](./setup.md).)

- **Liveness / no browser.** The MV3 service worker can sleep; the bridge keeps a
  `connectNative` port open to hold it alive and reconnects with backoff. A
  request can still hit a moment where no browser is connected → the daemon
  returns `not_enabled` ("no browser connected"). Treat as transient (retry /
  show "browser not connected").
- **Multi-browser, browser-type-only.** The daemon routes to any of the connected
  browsers (see [above](#multi-browser-which-browser-answers)) and the client
  picks. But profiles/channels of the same browser collapse to one id and the
  last relay wins; profile-level selection is deferred
  ([`../native-messaging/multi-instance.md`](../native-messaging/multi-instance.md)).
- **Site-SDK absent.** Bridge requests have no content-script sender, so
  page-owned `window.Monocle` commands never appear in bridge results. Documented
  v1 gap.
- **Incognito excluded.** If the active tab is incognito/private, suggestion and
  execute calls return `no_active_tab`.
