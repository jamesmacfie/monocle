# Extension integration

> **Status: extension side implemented; bridge host built at `apps/bridge`
> (macOS M0+M1).** This document is the design/contract; the canonical build
> status lives in [README.md](./README.md) and the project `CLAUDE.md`.

This document specifies how the bridge plugs into Monocle: the feature module
that owns it, the exact reuse points, the manifest changes, and the files to add
or touch. The guiding principle is that the bridge is an **adapter** — it
reuses the existing command-query, surfaces, settings, and validation machinery
rather than duplicating any of it.

---

## Shape: a feature module

Implement the bridge as a `native-messaging` **feature module** under
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
- **`configSchema`** (Zod): `{ enabled: boolean, pairedClients: PairedClient[] }`
  where `PairedClient` holds `{ instanceId, name, tokenHash, scopes, createdAt,
  lastUsedAt }`. Durable, in `monocle-feature-config`.
- **Pending pairing state**: `{ pairingId, codeHash, expiresAt, attempts,
  client }` in `monocle-feature-state` (transient, cleared on resolve/expiry).
- **Settings page**: an `enabled` toggle + a `record-list` of paired clients with
  a per-row **Revoke** action (the `record-list` FormField already exists — see
  [../features.md](../features.md)).

---

## The request pump

`port.onMessage` validates and dispatches the protocol methods. It mirrors the
in-extension router (`background/messages/index.ts`, `handleMessage` + `ts-pattern`
+ schema validation) but is a **separate entry point** fed by the port rather
than the runtime listener. For each request:

1. Validate the envelope against a Zod schema (new entries in
   `shared/types/messaging.ts` + `shared/types/validation.ts`, following the
   existing message-validation pattern).
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
| Pairing modal | `upsertSurface(ownerId, surface)` (`background/surfaces.ts`), pattern from `background/commands/tools/urlAsQrCode.ts` |
| Durable config / transient state | `getFeatureConfig`/`setFeatureConfig` (`background/features/config.ts`), `getFeatureState`/`setFeatureState`/`clearFeatureState` (`background/features/state.ts`) |
| Message validation pattern | `background/messages/getCommands.ts` as the handler template; `shared/types/messaging.ts` / `validation.ts` |

---

## New: the `Suggestion` → `ExternalSuggestion` mapper

A single named module (e.g. `background/features/nativeMessaging/externalSuggestion.ts`)
owns the projection defined in [protocol.md](./protocol.md). It is the **one
place** internal `Suggestion` shape meets the public wire contract, so internal
palette changes are absorbed here rather than breaking the app. Keep it pure and
unit-tested (input `Suggestion`, output `ExternalSuggestion`).

---

## Pairing modal

On `pair/request`, push a `modal` surface (display-only: code text + client name
+ `countdownTo`; `dismiss` = cancel). Owner is a session-scoped id (e.g.
`native-messaging`), so it is cleared on startup like other ephemeral owners.
When no `SurfaceHost` is mounted on the active tab (e.g. `chrome://`), fall back
to opening the extension pairing page — see
[authentication-and-security.md](./authentication-and-security.md).

---

## Manifest changes (`wxt.config.ts`)

- **Add `nativeMessaging`.** It is absent today (`permissions` arrays around
  `wxt.config.ts:123`/`:141`). **Open question:** whether `nativeMessaging` can
  sit in `optional_permissions` (requested only when the user enables the bridge,
  keeping it off the default install warning) or must be a required permission
  (always-visible warning). Confirm against the current Chrome/Firefox permission
  rules during build; prefer optional + request-on-enable if allowed, to honour
  the opt-in posture.
- **`tabs`** is already optional (`wxt.config.ts:20`). Request it at the same time
  the user enables the bridge; without it the active tab's `url`/`title` are not
  readable (see [architecture.md](./architecture.md)).
- **Pin a Chrome extension ID.** No `key` is pinned today, so the Chrome
  extension ID is not stable; the host manifest's `allowed_origins` needs a stable
  ID. Add a `key` (deterministic ID) before shipping. Firefox is already stable
  via `gecko.id = "ff@monocle.com"`.

---

## Files to add / touch

Add:

- `background/features/nativeMessaging/index.ts` — the `FeatureModule` (init,
  config schema, settings page, `handleAction` for revoke).
- `background/features/nativeMessaging/port.ts` — `connectNative`, the request
  pump, reconnect.
- `background/features/nativeMessaging/pairing.ts` — code generation, modal push,
  verification, token minting.
- `background/features/nativeMessaging/externalSuggestion.ts` — the DTO mapper.
- `shared/types/nativeMessaging.ts` — protocol envelope + `ExternalSuggestion`
  types and Zod schemas.
- Tests: mapper, pairing (code/expiry/attempts/constant-time), envelope
  validation, auth/scope checks, active-tab resolution (mocked
  `chrome.tabs.query`).

Touch:

- `background/index.ts` — call the module's `init()`.
- `background/features/` registry — register the module.
- `wxt.config.ts` — `nativeMessaging` + Chrome `key` (see above).
- `shared/types/messaging.ts` / `validation.ts` — if any in-extension messages
  are needed for the settings page beyond the generic feature messages.

The native host binary and installer live **outside** this repo's extension
package — see [native-host.md](./native-host.md).

---

## Related docs

- [../features.md](../features.md) — the feature-module contract this builds on.
- [../surfaces.md](../surfaces.md) — the modal primitive.
- [protocol.md](./protocol.md) — the DTO and methods the pump implements.
- [authentication-and-security.md](./authentication-and-security.md) — pairing,
  tokens, storage layout.
