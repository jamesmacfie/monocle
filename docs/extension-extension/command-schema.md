# Declarable command schema

> **Status: implemented (v1).** See [README.md](./README.md) for status + the two v1 divergences (schema reuse, trimmed protocol).

This is the reference for what a peer extension may declare. It is the **shared
external-command schema** (`shared/types/externalCommands.ts` after the
[provider refactor](./provider-refactor.md)) — the same schema the site SDK uses,
minus the site-specific `placement` field. Everything here is validated by Zod at
the message boundary and re-checked by a tree walker for caps/duplicates/reserved
ids, exactly as `validateSiteSdkRegistrations` does today.

## Registration

```ts
type ExternalRegistration = {
  id: string          // peer-chosen, kebab/safe id; unique within the peer
  namespace: string   // safe id; groups the peer's commands, used in keywords
  name?: string       // label for the generated per-peer group
  icon?: CommandIcon  // validated lucide/url/svg
  commands: ExternalCommand[]   // the tree
}
```

A peer may send up to **20 registrations**, each with up to **100 commands**,
tree depth up to **5** (the site SDK caps: `SITE_SDK_MAX_COMMANDS = 100`,
`SITE_SDK_MAX_DEPTH = 5`, registrations ≤20). These caps carry over verbatim.

## Command node types

A peer may declare the same six node types the site SDK exposes. Each maps 1:1 to
a Monocle `CommandNode` via the shared `externalProvider` engine.

### `action`

```ts
{
  type: "action"
  id: string
  name: string | string[]            // string[] = breadcrumb-style multi-name
  description?: string
  icon?: CommandIcon
  color?: ColorName | CommandColor
  keywords?: string[]
  actionLabel?: string
  modifierActionLabel?: Partial<Record<ModifierKey, string>>
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  urlRules?: { allowUrls?: string[]; denyUrls?: string[] }
  execute: { callbackId: string }    // a ref — the function stays in the peer
  external?: { result?: "none" | "value"; focusBrowser?: boolean }  // see protocol.md
}
```

Selecting the command sends an `execute` invoke to the peer with `callbackId`,
the public `commandId`, the `Browser.Context`, and any form `values`.

### `submit`

Form-style executable. Same as `action` plus `doNotAddToRecents?`. Combine with
`input` nodes (below) to gather field values, which arrive in the `execute`
invoke's `values`.

### `group`

```ts
{
  type: "group"
  id, name, icon, …
  enableDeepSearch?: boolean          // defaults true (matches site SDK)
  children:
    | { type: "static"; commands: ExternalCommand[] }     // resolved by Monocle, no RPC
    | { type: "callback"; callback: { callbackId: string } } // resolved by invoke RPC
}
```

`static` children render with **no round-trip to the peer** — they live in
Monocle's cached tree, so they work while the peer is asleep. `callback` children
resolve lazily via a `children` invoke when the user drills in (wakes the peer).
Prefer `static` for stable menus; use `callback` only for genuinely dynamic lists.

### `search`

```ts
{
  type: "search"
  id, name, icon, …
  actionLabel?: string
  execute?: { callbackId: string }    // optional: run the typed query directly
  getResults: { callbackId: string }  // required: resolve results for a query
}
```

Typing in a search command sends a `search` invoke with the query string; the
peer returns a command list, re-validated and converted. Searching always wakes
the peer.

### `input`

```ts
{ type: "input"; id, name, …; field: ExternalCommandFormField }
```

An inline form field rendered as a palette row. `ExternalCommandFormField` is the
site SDK's `SiteSdkFormField` subset: `text`, `textarea`, `select`, `checkbox`,
`switch`, `multi`, `text-list`, `color`. Values feed a sibling `submit`.

### `display`

```ts
{ type: "display"; id, name, description?, icon? }
```

A static, non-executable row — use for empty/error states instead of an alert,
matching Monocle's convention.

## Fields a peer may NOT declare

Enforced by the shared schema omitting them entirely (a peer that includes them
fails `.strict()` validation):

- `permissions` — a peer cannot make Monocle request or use a browser permission.
- `supportedBrowsers` — not a peer's concern.
- `keybinding` — a peer cannot claim a global shortcut. `allowCustomKeybinding`
  is forced `false` on every converted node. (The *user* may still assign a
  keybinding to an external command afterwards through the settings page — that
  is keyed by command id and is the user's choice, not the peer's.)
- Any raw executable function — only `{callbackId}` refs cross the boundary.

This is the same containment the site SDK relies on (see
[../site-sdk-security.md](../site-sdk-security.md)): the peer declares *data*, and
all behavior round-trips back to the peer's own sandbox.

## Id encoding and namespacing

Public ids a peer chooses must match the safe-id pattern
(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, ≤100 chars) and must not collide with Monocle's
generated-action prefixes/suffixes (the reserved-id check,
`GENERATED_ACTION_PREFIXES` / `GENERATED_ACTION_SUFFIXES`).

Internally Monocle rewrites every public id to
`extension:<extId>:<registrationId>:<publicPath>` (`<publicPath>` is the dotted
path through nested groups, same as the site SDK's `toInternalCommandId`); see
[architecture.md](./architecture.md). Because this is a stable string, the user's
keybindings, URL rules, hidden state, and favorites all scope per-command and
per-peer automatically through `background/commands/settings.ts` — no new
settings storage is required.

## Root placement

The site SDK lets a command set `placement: "root"` to appear at the palette root
rather than under the per-owner group. For v1 the default is **no root
placement**: every peer command lives under a generated per-peer group
(`createOwnerGroupCommand`, the generalised `createSiteGroupCommand`), labelled
with the peer's name/icon. This keeps the root list uncluttered and makes
provenance obvious. Root placement for peers is a future item gated on
anti-clutter/anti-spoofing UX (see
[registration-and-trust.md](./registration-and-trust.md)).

## Validation summary

1. Zod shape validation (`ExtRequestSchema` → `ExternalRegistration[]`),
   `.strict()` so unknown fields fail.
2. Tree walk (`visitCommands`): depth ≤5, total count ≤100 per registration,
   no duplicate ids within a registration, no reserved ids, `placement` rejected
   for peers.
3. Callback-returned lists (from `children`/`search` invokes) re-validated with
   `allowPlacement:false` and the same caps.

A failed registration is rejected wholesale with a `bad_request` error carrying
the validation detail — Monocle never stores a partially-valid tree.
</content>
