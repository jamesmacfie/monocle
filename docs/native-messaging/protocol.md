# Wire protocol

> **Status: extension side implemented; bridge host built at `apps/bridge`
> (macOS M0+M1).** This document is the design/contract; the canonical build
> status lives in [README.md](./README.md) and the project `CLAUDE.md`.

This document defines the JSON protocol between the external app and the
extension (carried verbatim by the native host). It is a **stable public
contract** — the external app codes against it — so it does **not** expose
Monocle's internal types. Suggestions cross the wire as the `ExternalSuggestion`
DTO, not the internal `Suggestion`.

The public TypeScript contract for this protocol lives in
`packages/native-bridge-protocol` (`src/wire.ts` for dependency-free DTOs and
method maps, `src/validation.ts` for the Zod request schema and response
helpers). `apps/extension/shared/types/nativeMessaging.ts` re-exports that
package for extension-local compatibility, and `apps/raycast/src/lib/types.ts`
imports the same wire types instead of mirroring them by hand.

---

## Envelope

Every request and response shares an envelope:

```jsonc
// request
{
  "v": 1,                       // protocol version
  "id": "uuid",                 // client-generated, echoed in the response
  "method": "suggestions/get-for-active-tab",
  "params": { /* method-specific */ }
}
```

```jsonc
// success response
{ "v": 1, "id": "uuid", "ok": true, "result": { /* method-specific */ } }

// error response
{ "v": 1, "id": "uuid", "ok": false, "error": { "code": "unauthorized", "message": "…" } }
```

Error `code` values: `bad_request`, `unauthorized`, `forbidden_scope`,
`not_enabled`, `pairing_expired`, `pairing_rejected`, `rate_limited`,
`no_active_tab`, `internal`, and (v2 execution) `not_found`, `forbidden`,
`execution_disabled`, `execution_failed`. The app branches on `code`, never on
`message`.

Bumping `v` is reserved for breaking changes; additive fields do not bump it.
`meta/info` advertises the versions a given host/extension supports.

---

## Methods

| Method | Auth | Purpose |
| --- | --- | --- |
| `meta/info` | none | Capability discovery: supported protocol versions, available scopes, build identity. |
| `status` | none | Liveness + instance identity (also `GET /status`; see [multi-instance.md](./multi-instance.md)). |
| `pair/request` | none | Begin pairing; returns a code for the app to **display** (the human types it on the browser's Integrations page). |
| `pair/poll-status` | none | Poll a pairing by id; returns `pending` until the human Accepts in the browser, then the bearer token **once**. |
| `suggestions/get-for-active-tab` | `suggestions:read` | Root suggestions for the active tab. |
| `suggestions/search-active-tab` | `suggestions:read` | Query-scored suggestions for the active tab. |
| `suggestions/get-children` | `suggestions:read` | Drill into a group/search node; returns its children (which may be groups → infinite nesting). |
| `commands/execute` | `commands:execute` | **v2.** Run a command by id; optionally returns a value. See [execution.md](./execution.md). |

Unauthenticated methods are limited to discovery and pairing. Everything that
reads Monocle data requires a token with the matching scope. Execution is behind
a distinct, higher-blast-radius scope (`commands:execute`) and the global
Allow-execution opt-in.

### `meta/info`

```jsonc
// result
{
  "protocolVersions": [1],
  "scopes": ["suggestions:read", "commands:execute"],
  "bridgeEnabled": true,
  "executionEnabled": false,
  "browser": { "name": "chrome", "channel": "stable", "extensionVersion": "0.0.1" }
}
```

### `status`

```jsonc
// result — see multi-instance.md for why this exists
{
  "ok": true,
  "browser": "firefox",
  "channel": "stable",
  "extensionVersion": "0.0.1",
  "bridgeEnabled": true,
  "executionEnabled": false,
  "portOwner": true            // is this host the one holding the fixed port
}
```

### `pair/request` → `pair/poll-status`

Direction B: the app displays the code; the human types it on the browser's
**Integrations** page; the browser mints the token on Accept and the app collects
it by polling. See [authentication-and-security.md](./authentication-and-security.md)
for the full flow and security parameters.

```jsonc
// pair/request params
{ "client": { "name": "Raycast", "instanceId": "uuid" } }
// pair/request result — `code` is shown to the human, who types it in the browser
{ "pairingId": "uuid", "code": "481920", "expiresInSeconds": 60 }

// pair/poll-status params (poll ~2s until terminal)
{ "pairingId": "uuid" }
// pair/poll-status result — one of:
{ "status": "pending" }
{ "status": "approved", "token": "<opaque>", "scopes": ["suggestions:read", "commands:execute"] } // token once
{ "status": "expired" }
{ "status": "rejected" }
```

### `suggestions/get-for-active-tab`

```jsonc
// params
{ "limit": 50, "includeFavorites": true }
// result
{ "url": "https://example.com/", "title": "Example", "suggestions": [ /* ExternalSuggestion[] */ ] }
```

### `suggestions/search-active-tab`

```jsonc
// params
{ "query": "close tab", "limit": 50 }
// result
{ "url": "https://example.com/", "title": "Example", "query": "close tab", "suggestions": [ /* ExternalSuggestion[] */ ] }
```

`limit` is clamped server-side and exists partly to keep responses under the
host→browser **1 MB** native-messaging cap (see [native-host.md](./native-host.md)).

### `suggestions/get-children`

Group and search suggestions are navigational containers, not executable
(`commands/execute` denies them — see [execution.md](./execution.md)). This method
returns a container's children, mirroring how the palette nests command pages.
Navigation is a **read**, scoped to `suggestions:read`, not `commands:execute` —
browsing the command tree works even when command execution is disabled.

`path` is the breadcrumb of command ids from root to the node being entered. The
caller nests by appending the id of any returned `group`/`search` child:

```jsonc
// params — drill into "Bookmarks", then a nested folder
{ "path": ["bookmarks"], "query": "design", "limit": 50 }
// result
{
  "url": "https://example.com/",
  "title": "Example",
  "path": ["bookmarks"],
  "suggestions": [ /* ExternalSuggestion[] — children; groups can be drilled again */ ]
}
```

`query` is optional (used by `search`-type nodes and to filter a page). An empty
result is a real-but-empty page; a `path` that doesn't resolve to a group/search
node returns `not_found`. Site-SDK children are absent (no content sender), the
same v1 gap as the other suggestion methods.

### `commands/execute` (v2)

Run a command by id. The bridge applies the execution policy + per-command
opt-out, resolves the active tab, runs the command, optionally raises the
browser, and optionally returns a produced value. See [execution.md](./execution.md)
for the full model.

```jsonc
// params — form values are not carried over the wire, so submit commands
// are denied by default. `confirmed: true` is required for any command
// whose suggestion carries `confirmAction: true` (the client must confirm
// with the user first); without it the command is refused (`forbidden`).
{ "id": "copy-title-and-url-as-markdown" }
// result
{
  "ran": true,
  "focused": true,         // present when the browser was raised (focusBrowser commands)
  "value": "[Example](https://example.com/)",  // present only for result:"value" commands
  "contentType": "text/markdown"               // optional hint for value
}
```

Errors specific to execution: `forbidden_scope` (token lacks `commands:execute`),
`execution_disabled` (the global Allow-execution opt-in is off), `forbidden`
(policy / `external.allowed:false` / confirmAction / wrong platform / missing
permission / submit-by-default / generated-action id), `not_found`,
`no_active_tab`, `execution_failed` (the executor threw).

---

## The `ExternalSuggestion` DTO

A stable, narrow projection of the internal `Suggestion` (`shared/types/ui.ts`).
Internal palette changes must not break the wire, and UI-only fields (synthesized
`actions`, internal weights, modifier labels) must not leak.

```jsonc
{
  "id": "browser-close-tab",        // stable command id
  "type": "action",                 // action | submit | group | search | display | calculation
  "title": "Close Tab",             // from Suggestion.name (breadcrumb joined if array)
  "subtitle": "Close the current tab",   // from description, optional
  "icon": "X",                      // v1 icon ref, optional
  "iconType": "lucide",             // lucide | url, optional
  "keywords": ["tab", "close"],     // optional
  "requiresPermission": ["tabs"],   // from Suggestion.permissions, optional
  "confirmAction": true              // optional; client confirms, then sends confirmed:true
}
```

Mapping rules (implemented by the named mapper in
[extension-integration.md](./extension-integration.md)):

- `title` ← `Suggestion.name` (join with `›` when it is a breadcrumb array).
- `subtitle` ← `Suggestion.description`.
- `icon` ← v1-compatible string from `Suggestion.icon`: a Lucide catalog name
  (`"X"`, `"FolderOpen"`, ...) or an http(s) URL.
- `iconType` ← `"lucide"` or `"url"` when `icon` is present. This is additive
  metadata for clients that need to render the string through their own icon
  system instead of guessing.
- `requiresPermission` ← `Suggestion.permissions`.
- `confirmAction` ← carried through (emitted only when `true`) so a client can
  confirm a destructive command with the user before sending `confirmed: true`
  on `commands/execute`.
- Dropped entirely: `actions`, `rankWeight`, `executionPayload`,
  `modifierActionLabel`, `inputField`, calculation `content`
  blocks, and command source/category metadata.
- `calculation`-type suggestions: expose `title`/`subtitle` from the rendered
  value but **not** the structured `ContentBlock`s.

If a future version needs a field, **add** it (additive, no `v` bump). Never
re-shape an existing field.

---

## Related docs

- [authentication-and-security.md](./authentication-and-security.md) — the auth
  model behind the `auth` column.
- [architecture.md](./architecture.md) — how a request reaches `getCommands`.
- [extension-integration.md](./extension-integration.md) — the `Suggestion` →
  `ExternalSuggestion` mapper.
