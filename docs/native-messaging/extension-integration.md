# Extension integration

> **Status: extension side implemented; bridge host built at `apps/bridge`
> (macOS M0+M1).** This document is the design/contract; the canonical build
> status lives in [README.md](./README.md) and the project `CLAUDE.md`.

This document specifies how the bridge plugs into Monocle: the feature module
that owns it, the exact reuse points, the manifest posture, and the implemented
file map. The bridge is an **adapter** — it reuses the existing command-query,
surfaces, settings, and validation machinery rather than duplicating any of it.

---

## Shape: a feature module

The bridge is implemented as a `native-messaging` **feature module** under
`background/features/`, alongside `focus/`, `tabGroups/`, and `elementHider/`.
This gives it, for free, the two stores (`monocle-feature-config`,
`monocle-feature-state`), a declarative settings page, an `init()` lifecycle hook,
and `handleAction` routing — see [../features.md](../features.md).

Module responsibilities:

- **`init()`** (called from `background/index.ts`): if the opt-in flag is on, call
  `chrome.runtime.connectNative("com.monocle.bridge")`, attach `port.onMessage`
  and `port.onDisconnect` (reconnect with backoff while still enabled). If the
  flag is off, do nothing.
- **`port.onMessage`**: the request pump (below).
- **`configSchema`** (Zod):
  `{ enabled: boolean, allowExecution: boolean, pairedClients: PairedClient[] }` where
  `PairedClient` holds `{ instanceId, name, tokenHash, scopes, createdAt, lastUsedAt }`. Durable, in
  `monocle-feature-config`.
- **Pending pairing state**: `{ pairingId, codeHash, expiresAt, attempts,
  status, approvedToken?, client }` in `monocle-feature-state` (transient,
  cleared on resolve/expiry).
- **Settings page**: an `enabled` toggle + a `record-list` of paired clients with
  a per-row **Revoke** action (the `record-list` FormField already exists — see
  [../features.md](../features.md)).

---

## The request pump

`port.onMessage` validates and dispatches the protocol methods. It mirrors the
in-extension router (`background/messages/index.ts`, `handleMessage` + `ts-pattern`
+ schema validation) but is a **separate entry point** fed by the port, not the
runtime listener. For each request:

1. Validate the envelope against `BridgeRequestSchema` from
   `packages/native-bridge-protocol/src/validation.ts` (re-exported through
   `shared/types/nativeMessaging.ts` for extension-local imports).
2. For authenticated methods: hash + constant-time-compare the bearer token
   against `pairedClients`, check scope, check `enabled`.
3. Resolve the active tab:
   `chrome.tabs.query({ active: true, currentWindow: true })`; skip incognito
   unless explicitly enabled; build `Browser.Context`
   (`{ url, title, modifierKey: null }`).
4. Build suggestions:
   - root → `getCommands(context)` (`background/commands/index.ts`) then
     `commandsToSuggestions(commands, context)` (`background/commands/suggestions.ts`).
   - search → the `monocle-commands-search` scoring path
     (`background/commands/searchIndex.ts`) with the supplied query.
   - group/search drill-down (`suggestions/get-children`) →
     `getCommandPageCommands(context, path, query)` (`background/commands/query.ts`),
     the same path-based page resolver the palette uses; children that are
     groups can be drilled again (infinite nesting). Scoped to `suggestions:read`
     — navigation is a read, not `commands:execute`.
5. Map `Suggestion[]` → `ExternalSuggestion[]` via the mapper (below).
6. `port.postMessage` the response envelope.

---

## Reuse points (do not reinvent)

| Need | Reuse |
| --- | --- |
| Root suggestions for a URL | `getCommands` / `getCommandCollections` (`background/commands/query.ts`) |
| `CommandNode` → UI row | `commandsToSuggestions` (`background/commands/suggestions.ts`) |
| Query-scored suggestions | the `monocle-commands-search` handler + `background/commands/searchIndex.ts` |
| Group/search children (nesting) | `getCommandPageCommands(context, path, query)` (`background/commands/query.ts`) |
| Context type | `Browser.Context` (`shared/types/browser.ts`) |
| Durable config / transient state | `getFeatureConfig`/`setFeatureConfig` (`background/features/config.ts`), `getFeatureState`/`setFeatureState`/`clearFeatureState` (`background/features/state.ts`) |
| Message validation pattern | `background/messages/getCommands.ts` as the handler template; `shared/types/messaging.ts` / `validation.ts` |

---

## New: the `Suggestion` → `ExternalSuggestion` mapper

A single named module (e.g. `background/features/nativeMessaging/externalSuggestion.ts`)
owns the projection defined in [protocol.md](./protocol.md). It is the **one
place** internal `Suggestion` shape meets the public wire contract, so internal
palette changes are absorbed here rather than breaking the app. It is pure and
unit-tested (input `Suggestion`, output `ExternalSuggestion`).

---

## Manifest posture (`wxt.config.ts`)

- **`nativeMessaging`** is in `optional_permissions`, requested on demand when
  the user enables the bridge. This keeps it off the default install warning and
  preserves the opt-in posture.
- **`tabs`** is also optional and requested with the bridge; without it the
  active tab's `url`/`title` are not readable (see [architecture.md](./architecture.md)).
- **Chrome extension ID remains open.** No Chrome `key` is pinned yet, so the
  bridge host manifest uses `MONOCLE_CHROME_EXTENSION_ID` / config override for
  Chrome. Firefox is stable via `gecko.id = "ff@monocle.com"`.

---

## Implemented files

- `background/features/nativeMessaging/index.ts` — the `FeatureModule` (init,
  config schema, settings page, revoke action).
- `background/features/nativeMessaging/commands.ts` — enable/disable palette
  commands.
- `background/features/nativeMessaging/port.ts` — `connectNative`, port
  lifecycle, reconnect.
- `background/features/nativeMessaging/pump.ts` — protocol validation and method
  dispatch.
- `background/features/nativeMessaging/pairing.ts` — code generation,
  browser-side verification, token minting.
- `background/features/nativeMessaging/reconnect.ts` — alarm-backed reconnect
  heartbeat.
- `background/features/nativeMessaging/types.ts` — durable config and transient
  state shapes.
- `background/features/nativeMessaging/auth.ts` and `crypto.ts` — bearer-token
  authentication, hashing, constant-time comparison, token/code generation.
- `background/features/nativeMessaging/suggestions.ts` — active-tab root,
  search, and child suggestions.
- `background/features/nativeMessaging/execute.ts` — `commands/execute`
  preflight, command execution, focus/result handling.
- `background/features/nativeMessaging/externalSuggestion.ts` — the DTO mapper.
- `packages/native-bridge-protocol/src/wire.ts` and `src/validation.ts` —
  public protocol DTOs, method maps, and Zod schemas.
- Tests live in `background/features/nativeMessaging/*.test.ts`.

The native host binary and installer live in `apps/bridge` — see
[native-host.md](./native-host.md) and [bridge-app-prd.md](./bridge-app-prd.md).

---

## Related docs

- [../features.md](../features.md) — the feature-module contract this builds on.
- [protocol.md](./protocol.md) — the DTO and methods the pump implements.
- [authentication-and-security.md](./authentication-and-security.md) — pairing,
  tokens, storage layout.
