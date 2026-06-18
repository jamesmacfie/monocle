# Wire protocol

> **Status: proposed (v1 design).** Not yet built.

This document defines the JSON protocol between the external app and the
extension (carried verbatim by the native host). It is a **stable public
contract** — the external app codes against it — so it deliberately does **not**
expose Monocle's internal types. Suggestions cross the wire as the
`ExternalSuggestion` DTO, not the internal `Suggestion`.

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
| `pair/request` | none | Begin pairing; triggers the in-extension code modal. |
| `pair/submit-code` | none | Submit the human-entered code; on success returns a bearer token **once**. |
| `suggestions/get-for-active-tab` | `suggestions:read` | Root suggestions for the active tab. |
| `suggestions/search-active-tab` | `suggestions:read` | Query-scored suggestions for the active tab. |
| `commands/execute` | `commands:execute` | **v2.** Run a command by id; optionally returns a value. See [execution.md](./execution.md). |

Unauthenticated methods are limited to discovery and pairing. Everything that
reads Monocle data requires a token with the matching scope. Execution is a
**v2** capability behind a distinct, higher-blast-radius scope (`commands:execute`);
v1 ships only the read-only `suggestions/*` methods.

### `meta/info`

```jsonc
// result
{
  "protocolVersions": [1],
  "scopes": ["suggestions:read"],
  "bridgeEnabled": true,
  "browser": { "name": "chrome", "channel": "stable", "extensionVersion": "0.0.1" }
}
```

### `status`

```jsonc
// result — see multi-instance.md for why this exists
{
  "ok": true,
  "browser": "firefox",
  "profile": "default",        // when derivable
  "channel": "stable",
  "extensionVersion": "0.0.1",
  "bridgeEnabled": true,
  "portOwner": true            // is this host the one holding the fixed port
}
```

### `pair/request` → `pair/submit-code`

See [authentication-and-security.md](./authentication-and-security.md) for the
full flow and security parameters.

```jsonc
// pair/request params
{ "client": { "name": "Raycast", "instanceId": "uuid" } }
// pair/request result
{ "pairingId": "uuid", "expiresInSeconds": 60 }

// pair/submit-code params
{ "pairingId": "uuid", "code": "481920" }
// pair/submit-code result (token returned exactly once, never again)
{ "token": "<opaque>", "scopes": ["suggestions:read"] }
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

### `commands/execute` (v2)

Run a command by id. The bridge applies the execution policy + per-command
opt-out, resolves the active tab, runs the command, optionally raises the
browser, and optionally returns a produced value. See [execution.md](./execution.md)
for the full model.

```jsonc
// params (v2: id only — form values are not carried over the wire, so submit
// commands are denied by default)
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

A stable, intentionally narrow projection of the internal `Suggestion`
(`shared/types/ui.ts`). Internal palette changes must not break the wire, and
UI-only fields (synthesized `actions`, internal weights, modifier labels) must
not leak.

```jsonc
{
  "id": "browser-close-tab",        // stable command id
  "type": "action",                 // action | submit | group | search | display | calculation
  "title": "Close Tab",             // from Suggestion.name (breadcrumb joined if array)
  "subtitle": "Close the current tab",   // from description, optional
  "icon": "x",                      // normalized icon ref, optional
  "keywords": ["tab", "close"],     // optional
  "requiresPermission": ["tabs"],   // from Suggestion.permissions, optional
  "source": "browser"               // category/source bucket, for grouping in the app
}
```

Mapping rules (implemented by the named mapper in
[extension-integration.md](./extension-integration.md)):

- `title` ← `Suggestion.name` (join with `›` when it is a breadcrumb array).
- `subtitle` ← `Suggestion.description`.
- `icon` ← normalized from `Suggestion.icon` to a string ref the app can resolve.
- `requiresPermission` ← `Suggestion.permissions`.
- Dropped entirely: `actions`, `rankWeight`, `executionPayload`,
  `modifierActionLabel`, `confirmAction`, `inputField`, calculation `content`
  blocks. v1 does not execute, so execution-only fields are not exposed.
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
