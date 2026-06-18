# Architecture

> **Status: proposed — not built.** See [README.md](./README.md).

This doc covers the moving parts, how they map onto Monocle's existing command
system, the MV3 service-worker lifecycle constraints that shape the design, and
the end-to-end data flows.

## The moving parts

```text
┌──────────────────────────┐                         ┌────────────────────────────────────────┐
│  Peer extension          │   cross-extension msg   │  Monocle background service worker       │
│  (its own MV3 worker)     │ ◀─────────────────────▶ │                                          │
│                          │   onConnectExternal      │  ┌────────────────────────────────────┐ │
│  • declares a command    │   onMessageExternal      │  │ extensionSdk (new)                   │ │
│    tree (data only)      │                         │  │  • durable registry (approved peers) │ │
│  • holds the real        │                         │  │  • cross-extension invoke() transport│ │
│    execute/children/     │                         │  └───────────────┬──────────────────────┘ │
│    search functions      │                         │                  │ uses                    │
└──────────────────────────┘                         │  ┌───────────────▼──────────────────────┐ │
                                                      │  │ externalProvider (new, shared)        │ │
            ▲                                         │  │  • convertCommand → CommandNode       │ │
            │ user approves                           │  │  • id encoding, callback re-validation│ │
            │ on settings page                        │  └───────────────┬──────────────────────┘ │
┌───────────┴──────────────┐                          │                  │ also used by            │
│  Extensions settings page │                         │  ┌───────────────▼──────────────────────┐ │
│  (feature module + modal  │  monocle-feature-*       │  │ siteSdk (refactored to adapter)       │ │
│   Surface for approval)   │ ◀──────────────────────  │  └────────────────────────────────────┘ │
└──────────────────────────┘                          └──────────────────────────────────────────┘
```

Four responsibilities:

1. **Peer extension** — declares a command tree as *data* (a serialized
   declarative schema, see [command-schema.md](./command-schema.md)) and holds
   the executable functions. It never runs code inside Monocle.
2. **`extensionSdk`** (new, `background/commands/extensionSdk/`) — the durable
   registry of approved peers and their last-registered trees, plus the
   cross-extension `invoke()` transport that round-trips back to a peer.
3. **`externalProvider`** (new, shared, `background/commands/externalProvider/`)
   — the transport-agnostic conversion engine extracted from the site SDK. Turns
   a validated declarative tree into background-owned `CommandNode`s. Used by
   *both* `extensionSdk` and `siteSdk`. See
   [provider-refactor.md](./provider-refactor.md).
4. **Extensions settings page** — a feature module
   (`background/features/extensionRegistry/`) that lists pending + approved peers,
   lets the user approve/revoke, and shows the approval prompt as a `modal`
   Surface. Mirrors the `nativeMessaging` feature but simpler (no pairing code).

## Why cross-extension messaging, not the native bridge

Both peers are browser extensions, so the browser gives us a first-class,
authenticated channel between them — there is no reason to route through a native
host:

- **Chrome**: the peer declares Monocle's id in its `externally_connectable`, or
  Monocle declares the peer's id; either side calls
  `chrome.runtime.connect(monocleId)` / `chrome.runtime.sendMessage(monocleId, …)`,
  and Monocle receives it on `chrome.runtime.onConnectExternal` /
  `onMessageExternal`. The sender's `sender.id` is **browser-verified** — this is
  the whole basis of the trust model.
- **Firefox**: supports `onConnectExternal` / `onMessageExternal` but **not** the
  `externally_connectable` manifest key. The id allowlist therefore moves into
  the handler (reject any `sender.id` not on the approved list). This is the one
  cross-browser asymmetry; see
  [registration-and-trust.md](./registration-and-trust.md).

Routing through the native bridge would be strictly worse: it would relay two
in-browser extensions through stdio→UDS→HTTP across a separate desktop process,
and the bridge has no concept of *registering* commands today — it only knows
`suggestions/*` and `commands/execute`. The bridge stays a desktop-app seam; this
feature is an extension-to-extension seam.

## MV3 lifecycle: why durable registration + edge RPC

A peer's MV3 service worker is **evicted when idle**. If Monocle held nothing and
asked the peer to list its commands every time the palette opened, the palette's
root list would block on another extension's cold start. That is unacceptable on
the hot path.

The design splits along the worker-liveness boundary:

- **Register the command *tree* declaratively, and cache it durably in Monocle.**
  The palette can render an approved peer's commands — names, icons, groups,
  static children — entirely from Monocle's cache, even while the peer is asleep.
  This is the part on the hot path, and it never touches the peer.
- **Open a port to the peer only at the edges** — to resolve a `search` query,
  expand a `group` whose children are callback-driven, or `execute` a command.
  `chrome.runtime.connect`/`sendMessage` to the peer **wakes its worker** on
  demand. These are off the root-list hot path (the user has already drilled in
  or selected).

This mirrors the site SDK's static-vs-callback split (`SiteSdkGroupChildren` is
either `{type:"static"}` or `{type:"callback"}`) — the difference is durability:
the site SDK's registry is per-tab and session-only; `extensionSdk`'s is keyed by
extension id and persisted.

## Owner namespace and id encoding

Generated command ids get a new owner prefix, alongside the existing
`site:` / `command:` / `automation:` / feature owners:

```text
extension:<extId>:<registrationId>:<publicPath>
```

- `<extId>` — the browser-verified peer extension id (the identity).
- `<registrationId>` — the peer's own registration id (a peer may register more
  than one tree/namespace).
- `<publicPath>` — the dotted path of public command ids, exactly as the site SDK
  encodes `site:<originHash>:<registrationId>:<path>` today
  (`toInternalCommandId` in `background/commands/siteSdk/commands.ts`).

Because the id is a stable string, **all per-command settings work unchanged**:
keybindings, `urlRules`, and hidden state are keyed by command id in
`background/commands/settings.ts`, so an external command id flows through the
keyboard page, URL-rules page, and hide-on-site exactly like a built-in command.
The `isExtensionCommandId(id)` helper (analogous to `isSiteSdkCommandId`) lets
ordering/keybinding logic recognise these without importing the registry.

## Data flows

### A. Announce → approve (one-time per peer)

```text
peer.runtime.sendMessage(monocleId, {kind:"announce", manifest:{name, icon, …}})
        │
        ▼
Monocle onMessageExternal  ── records a PENDING entry (sender.id + self-declared manifest)
        │
        ▼
Extensions settings page lists the pending peer
        │  user clicks Approve  (handleAction)
        ▼
extensionSdk stores sender.id on the durable allowlist  ──▶ peer may now register
```

The announce is **unauthenticated and trust-free**: it only adds a pending row.
Nothing the peer says is trusted until the user approves. The self-declared
`name`/`icon` are display-only and clearly labelled "as claimed by `<extId>`".

### B. Register → render (peer awake; palette later renders while asleep)

```text
peer.sendMessage(monocleId, {kind:"register", registrations:[…declarative tree…]})
        │
        ▼
Monocle validates against the shared external-command schema  (reject → error reply)
        │
        ▼
extensionSdk persists the tree under extension:<extId>  +  invalidate search index
        │
        ▼
(any later palette open)  source.ts loads extensionSdk commands  →  externalProvider
        converts the cached tree → CommandNode[]  →  commandsToSuggestions → palette
        (peer worker can be ASLEEP — nothing is sent to it)
```

### C. Drill-down / search (wakes the peer)

```text
user expands a callback group  OR  types in a search command
        │
        ▼
the CommandNode's children()/getResults() closure calls extensionSdk.invoke(extId, {
        type:"children"|"search", callbackId, commandId, context, search? })
        │
        ▼
chrome.runtime.connect(extId)  ── wakes the peer worker ── peer resolves the callback
        │
        ▼
peer replies with a declarative command list  ──▶  RE-VALIDATED  ──▶  converted to nodes
```

This is identical to the site SDK's `invokeSiteSdk` round-trip, except the
transport is `chrome.runtime.connect(extId)` instead of `sendTabMessage(tabId)`,
and the returned list is re-validated with the same caps/placement rules.

### D. Execute (wakes the peer; no privilege escalation)

```text
user selects an extension command  →  monocle-command-execute  →  execution.ts resolves the node
        │
        ▼
the action's execute() closure calls extensionSdk.invoke(extId, {
        type:"execute", callbackId, commandId, context, values })
        │
        ▼
peer worker runs ITS code in ITS sandbox (its own permissions); optionally returns a value
```

"Execute" is an outbound notification. Monocle grants the peer nothing — the peer
acts with the permissions *it already has*. A data-returning command (e.g. a
search-style command that produces a value) can return a value through the reply,
reusing the `CommandResult` return channel the native bridge already added to
`CommandExecutor` (`shared/types/commands.ts`). The default delivery for
extension commands is "tell the peer and forget"; returning a value is opt-in.

## Where this plugs into the existing command system

- **Loading**: `background/commands/source.ts` gains an `extensionSdk` source
  (like the existing `siteSdk` source it threads through `loadAllCommands`).
  Unlike the site SDK, it needs no per-request sender — it reads the durable
  registry, so it loads for any context (content overlay, new tab).
- **Search index**: every register/update/dispose invalidates the search index
  (`invalidateSearchIndex`), exactly as `monocle-site-sdk-sync` does.
- **Suggestions**: external commands convert to `Suggestion`s through the normal
  `commandsToSuggestions` path; no new UI rendering is required.
- **Settings/keybindings/url-rules**: unchanged — they key on command id.

## Key risks the design must hold

- **Hot-path latency**: never call a peer to build the root list. Cache the tree.
- **Worker-asleep correctness**: a callback group/search must degrade gracefully
  (timeout → empty/error display row, like the site SDK's NoOp rows) when the
  peer is slow or gone.
- **Dead owners**: a peer can be uninstalled while Monocle still holds its tree
  and the user's keybindings against its ids. Needs GC (see
  [registration-and-trust.md](./registration-and-trust.md)).
- **No privilege leak**: external commands must never carry `permissions` or map
  to privileged ops — enforced by the shared schema omitting those fields, same
  as the site SDK.
</content>
