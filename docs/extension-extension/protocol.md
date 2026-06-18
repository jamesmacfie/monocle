# Wire protocol

> **Status: proposed — not built.** See [README.md](./README.md).

This is the contract between a peer extension and Monocle, carried over native
cross-extension messaging. It is deliberately close to the site SDK's
`SiteSdkInvokeRequest`/`SiteSdkInvokeResponse` shapes (`shared/types/siteSdk.ts`)
and the native bridge's envelope conventions
(`shared/types/nativeMessaging.ts`), so reviewers familiar with either will
recognise it.

## Transport

- **Fire-and-forget + request/response messages** go over
  `chrome.runtime.sendMessage(monocleId, msg)` → Monocle's
  `chrome.runtime.onMessageExternal`. Used for `announce`, `register`,
  `update`, `dispose`, `ping`.
- **The invoke RPC** (Monocle → peer, to resolve children/search/execute) goes
  over a **port**: Monocle calls `chrome.runtime.connect(extId, {name:"monocle-ext"})`,
  which **wakes the peer's MV3 worker**; the peer answers on
  `chrome.runtime.onConnectExternal`. A port (not one-shot `sendMessage`) is used
  for the RPC because it keeps the peer worker alive across a multi-message
  exchange and lets Monocle correlate replies by `id`.

Direction summary:

| Message | Direction | Channel |
| --- | --- | --- |
| `announce` | peer → Monocle | `sendMessage` |
| `register` / `update` / `dispose` | peer → Monocle | `sendMessage` |
| `ping` / `pong` | either | `sendMessage` |
| `invoke` (children/search/execute) | **Monocle → peer** | port (`connect`) |

## Envelope

Every message is an object discriminated by `kind`, version-stamped, and
`id`-correlated — mirroring the bridge's `{v, id, …}` envelope:

```jsonc
// peer → Monocle
{ "v": 1, "id": "uuid", "kind": "register", "params": { /* … */ } }

// Monocle → peer reply (over sendMessage's response, or port message)
{ "v": 1, "id": "uuid", "ok": true,  "result": { /* … */ } }
{ "v": 1, "id": "uuid", "ok": false, "error": { "code": "…", "message": "…" } }
```

`EXT_PROTOCOL_VERSION = 1`. Monocle rejects mismatched `v` with
`unsupported_version`. The peer's `id` is echoed in the reply for correlation.

The whole envelope is validated by a Zod discriminated union
(`ExtRequestSchema`) at the boundary, exactly as `BridgeRequestSchema` validates
the bridge and `validateSiteSdkRegistrations` validates the site SDK. Unknown
fields fail (`.strict()`).

## Methods (peer → Monocle)

### `announce`

Unauthenticated. Adds/refreshes a **pending** entry; trusts nothing.

```jsonc
{ "v":1, "id":"…", "kind":"announce", "params": {
    "manifest": {                      // display-only, "as claimed"
      "name": "My Extension",
      "icon": { "type": "lucide", "name": "Puzzle" },  // CommandIcon, validated
      "description": "Adds widget commands"
    }
}}
```

Reply: `{ ok:true, result: { status: "pending" | "approved" } }`. If the peer's
`sender.id` is already approved, Monocle returns `"approved"` and the peer may
skip straight to `register`.

### `register`

Replaces the peer's whole registration set (replace-whole, like the site SDK's
sync). Allowed only if `sender.id` is approved, else `unauthorized`.

```jsonc
{ "v":1, "id":"…", "kind":"register", "params": {
    "registrations": [ ExternalRegistration, … ]   // see command-schema.md
}}
```

`ExternalRegistration` = `{ id, namespace, name?, icon?, commands: ExternalCommand[] }`
— the same shape as `SiteSdkRegistration`. Validated against the shared schema
(caps: ≤20 registrations, ≤100 commands, depth ≤5; reserved ids rejected).
Reply: `{ ok:true, result: { accepted: <count>, revision: <n> } }` or
`{ ok:false, error:{ code:"bad_request", message:"<validation detail>" } }`.

### `update` / `dispose`

`update` is sugar for re-`register` (replace-whole). `dispose` clears the peer's
registrations (commands disappear from the palette) but **keeps the approval** —
the peer can `register` again without re-approval. (Revoking approval is a
user action on the settings page, not a peer message — see
[registration-and-trust.md](./registration-and-trust.md).)

### `ping` / `pong`

Liveness/version check. `pong` returns `{ v, monocleVersion, approved:boolean }`.

## The invoke RPC (Monocle → peer)

When a converted `group`/`search`/`action` node needs the peer, Monocle sends an
`invoke` over the port. This is structurally identical to `SiteSdkInvokeRequest`:

```jsonc
// Monocle → peer (over the port)
{ "v":1, "id":"…", "kind":"invoke", "request": {
    "type": "execute" | "children" | "search",
    "callbackId": "…",           // the ref the peer gave at register time
    "commandId": "…",            // public id of the command
    "context": Browser.Context,  // { url, title, modifierKey, isNewTab? }
    "values": { … },             // execute only (form values)
    "search": "…"                // search only
}}
```

Peer reply (over the port), identical to `SiteSdkInvokeResponse`:

```jsonc
{ "v":1, "id":"…", "ok": true,  "commands": [ ExternalCommand, … ] }  // children/search
{ "v":1, "id":"…", "ok": true,  "result":   { "value": "…", "contentType": "text/plain" } }  // execute, opt-in
{ "v":1, "id":"…", "ok": true }                                       // execute, fire-and-forget
{ "v":1, "id":"…", "ok": false, "error": { "code":"…", "message":"…" } }
```

- Returned `commands` are **re-validated** with `allowPlacement:false` and the
  same caps before conversion — untrusted peer output is never trusted, exactly
  as the site SDK re-validates callback results.
- **Timeout**: Monocle abandons an invoke after a fixed budget (the site SDK uses
  3s; reuse that). On timeout/disconnect, a `children`/`search` resolves to an
  empty list rendered as a NoOp/display row; an `execute` surfaces an error
  toast. The palette never hangs on a sleeping or dead peer.

## Result channel for data-producing commands

A peer command may opt into returning a value (e.g. "compute X and give it back
to Monocle"). This reuses the `CommandResult` return type already on
`CommandExecutor` (`shared/types/commands.ts`, added for the native bridge). The
default is fire-and-forget; returning a value is opt-in per command via the
command's `external.result` field (mirrors the bridge's `external` opt-in on
`CommandNodeBase`). What Monocle does with a returned value (e.g. copy to
clipboard, show in a modal) is the same delivery seam the bridge uses.

## Error codes

A small enum, mirroring `BridgeErrorCode`:

| Code | Meaning |
| --- | --- |
| `unsupported_version` | `v` mismatch |
| `bad_request` | envelope or registration failed validation |
| `unauthorized` | `sender.id` not on the approved allowlist |
| `not_found` | invoke referenced an unknown command/callback |
| `rate_limited` | too many announces/registers (see caps) |
| `internal` | unexpected Monocle-side failure |

## Versioning

`v` is bumped only on breaking envelope changes. Additive command-schema fields
do not bump `v` — older peers simply omit them. Monocle advertises its supported
version in `pong.monocleVersion`, so a peer can feature-detect before relying on
newer fields.

## What is deliberately *not* in the protocol

- No way for a peer to declare a Monocle keybinding, permission, or
  privileged op. The shared schema omits these fields (see
  [command-schema.md](./command-schema.md)).
- No per-request token in v1 — `sender.id` is the identity. A token field is a
  forward-compatible addition (`auth?: {token}`) reserved for the roadmap.
- No streaming/push from peer to Monocle beyond `register`/`update` — Monocle
  pulls via invoke; the peer cannot spontaneously open the palette.
</content>
