# Authentication and security

> **Status: extension side implemented; bridge host built at `apps/bridge`
> (macOS M0+M1).** This document is the design/contract; the canonical build
> status lives in [README.md](./README.md) and the project `CLAUDE.md`.

The bridge exposes a loopback port that **any local process can reach**. That is
the central threat. Defense is layered: the feature is off until the user opts
in, a human must approve each new client via a bluetooth-style code confirmation,
and every data request carries a scoped bearer token. This document specifies the
opt-in, the pairing flow and its primitives, token handling, and the loopback
threat model.

---

## Opt-in

External messaging is **disabled by default**. A toggle on the bridge's settings
page (see [extension-integration.md](./extension-integration.md)) flips a durable
flag in `monocle-feature-config`. While off:

- The extension does **not** call `connectNative` (no host process, no port).
- All pairing requests are rejected with `not_enabled`.

Disabling the feature disconnects the port, revokes nothing automatically (tokens
persist), but makes the bridge unreachable until re-enabled.

---

## Pairing flow (bluetooth-style)

The confirmation code travels **extension → human → app**, never directly
extension → app. This proves a human who can see the browser approved the
specific app, without the app ever being handed a secret it could obtain
silently.

1. App calls `pair/request` with a human-readable `client.name` and a stable
   `client.instanceId`.
2. Extension generates a code, stores its **hash** + expiry + attempt counter in
   `monocle-feature-state` (transient), and shows a **modal surface** displaying
   the plaintext code, the requesting client name, and a `countdownTo` timer.
   Returns `{ pairingId, expiresInSeconds }` to the app — **no code**.
3. The user reads the code from the browser modal and **types it into the app**.
4. App calls `pair/submit-code` with `{ pairingId, code }`.
5. Extension constant-time-compares the hash. On match it mints a token, stores
   the **token hash** + client metadata + scopes in `monocle-feature-config`, and
   returns the **plaintext token exactly once**. On mismatch it increments the
   attempt counter; on cancel/expiry/over-limit it returns `pairing_rejected` /
   `pairing_expired` and clears the pending state.

### Pairing primitives (requirements)

- **Code:** ≥ 6 digits, generated with a CSPRNG (`crypto.getRandomValues`), never
  `Math.random`.
- **Expiry:** short (≈ 60s); the modal's `countdownTo` mirrors it.
- **Attempt cap:** small fixed number (e.g. 5) per `pairingId`; exhausting it
  rejects and clears.
- **One active pairing per client `instanceId`** at a time; a new `pair/request`
  supersedes any pending one for that client.
- **Comparison:** constant-time over the hashes, not string `===`.

### Pairing-UI fallback

A modal surface only renders where a `SurfaceHost` is mounted — the active tab's
content overlay, or the new tab. On `chrome://*`, the Chrome Web Store, the
add-ons gallery, a discarded/sleeping tab, or any page without a content host,
the modal would never appear and pairing would silently stall. So when no host is
available, the extension **opens a dedicated Monocle extension page** (an options
/ new-tab pairing route) and shows the code there instead. Pairing must never
depend on the active tab being a normal web page.

---

## Tokens

- **Opaque and random** (CSPRNG), bound to the client `instanceId` and a scope
  set.
- **Stored hashed.** `monocle-feature-config` holds only the token's hash plus
  metadata (client name, created-at, last-used, scopes). The plaintext is
  returned once at pairing and never recoverable — a lost token requires
  re-pairing.
- **Scoped.** v1 had a single scope, `suggestions:read`. **`commands:execute`**
  (v2 — running commands, see [execution.md](./execution.md)) is a **separate,
  higher-blast-radius scope**: reading never implies the right to execute. As
  built, a fresh pairing mints **both** scopes, but execution has a **second,
  independent gate** — a global **Allow execution** opt-in (`allowExecution`,
  off by default) on the settings page. `commands/execute` is refused unless the
  client's token carries `commands:execute` **and** the opt-in is on (else
  `forbidden_scope` / `execution_disabled` respectively). Because scopes are
  baked into the token at pairing, a client paired under v1 (token predating the
  scope) must **re-pair** to gain execution — re-pairing is the consent gesture
  for the expanded capability. (Per-client execution grants, rather than the
  global flag, are a possible future refinement.)
- **Revocable.** The settings page lists paired clients with created/last-used
  timestamps and a per-client **Revoke**. Revoking deletes the stored hash;
  subsequent requests with that token return `unauthorized`.

Authenticated requests present `Authorization: Bearer <token>`; the background
hashes and compares (constant-time), checks the scope against the method, and
checks the feature is still enabled.

---

## Loopback threat model

| Threat | Mitigation (v1) |
| --- | --- |
| Any local process can connect to the port | Human-confirmed pairing + scoped bearer token; transport requires `POST`+JSON+`Authorization`. |
| A web page issues loopback `fetch` to the port | Host **rejects requests with a browser `Origin` header** and sends no permissive CORS; data routes require a token the page cannot have. |
| Port exposed to other machines | Bind `127.0.0.1` only, never `0.0.0.0`. |
| Silent pairing by a background process | Code is shown only in the browser and must be typed back by a human; short expiry + attempt cap. |
| Token at rest | Stored hashed; plaintext returned once. |
| Replay / broad blast radius | Per-client tokens, scopes, and revocation; v1 is read-only (no execution). |

**Out of v1 (documented limit):** bearer tokens do **not** defend against local
malware that can read another process's memory or the app's token store. If that
is in scope, the upgrade path is **signed requests**: the app generates a key
pair at pairing, registers its public key, and signs each request; the extension
verifies the signature. This removes the bearer secret from the wire entirely.
Deferred to v2 — see [roadmap.md](./roadmap.md).

---

## Related docs

- [protocol.md](./protocol.md) — the `pair/*` methods and the `auth` column.
- [extension-integration.md](./extension-integration.md) — where the flag,
  pending state, and token hashes are stored, and the settings page.
- [../surfaces.md](../surfaces.md) — the modal primitive used for the code prompt.
- [../store-submission.md](../store-submission.md) — `nativeMessaging` review risk.

External reference: [Chrome permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)
(the `nativeMessaging` warning and the sensitivity of tab `url`/`title`).
