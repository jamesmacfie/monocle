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

- The extension does **not** call `connectNative`, so no browser relay is attached to the native
  host. The standalone Bridge app may still be running and answering `GET /status`, but protocol
  calls that require the extension either have no connected browser or are rejected by the extension.
- All pairing requests are rejected with `not_enabled`.

Disabling the feature disconnects the port, revokes nothing automatically (tokens
persist), but makes the bridge unreachable until re-enabled.

---

## Pairing flow (bluetooth-style, Direction B)

The confirmation code travels **extension → app → human → browser**. The app
**displays** the code; the human reads it from the app and **types it on the
browser's Integrations settings page**, where they Accept. This proves a human
who can see both the app and the browser approved the specific app — the same
possession proof as before, but the code is entered in the browser (so all
accept/reject lives on one page) rather than typed back into the app.

1. App calls `pair/request` with a human-readable `client.name` and a stable
   `client.instanceId`.
2. Extension generates a code, stores its **hash** + expiry + attempt counter as
   a **pending request** in `monocle-feature-state` (transient), and returns
   `{ pairingId, code, expiresInSeconds }`. The pending request appears in the
   Integrations page list (and bumps the nav + toolbar badge).
3. The app displays the code; the human reads it and types it on the
   **Integrations** page next to the request, then clicks **Accept**.
4. The extension constant-time-compares the hash. On match it mints a token,
   stores the **token hash** + client metadata + scopes in
   `monocle-feature-config`, and stashes the **plaintext token** on the pending
   record (transient). On mismatch it increments the attempt counter; on
   Reject/expiry/over-limit it clears the pending record.
5. The app polls `pair/poll-status { pairingId }` (~2s). It gets `pending` until
   Accept, then `approved` with the **plaintext token exactly once** (the
   pending record is dropped on read), or `expired` / `rejected`.

> Accepting a **browser extension** integration (the future extension-to-extension
> feature) needs **no code** — its identity is browser-verified, so the
> Integrations page shows a plain Accept. The code exists only for loopback apps,
> whose identity the browser cannot verify.

### Pairing primitives (requirements)

- **Code:** ≥ 6 digits, generated with a CSPRNG (`crypto.getRandomValues`), never
  `Math.random`.
- **Expiry:** short (≈ 60s).
- **Attempt cap:** small fixed number (e.g. 5) per `pairingId`; exhausting it
  rejects and clears.
- **One active pairing per client `instanceId`** at a time; a new `pair/request`
  supersedes any pending one for that client.
- **Comparison:** constant-time over the hashes, not string `===`.

### Why the code is returned to the app (trade-off)

Direction B hands the plaintext code to the (possibly untrusted) loopback caller,
where the old modal-based flow showed it only in the browser. This is a
deliberate, accepted trade: completing pairing still requires a **human** to
carry the code from the app into Monocle's Integrations page, so a local impostor
that grabs a code cannot finish pairing without the user typing it into the
browser for it. The possession proof is preserved; only the surface where the
code is entered moved.

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
| Any local process can connect to the port | Human-confirmed pairing + scoped bearer token; the daemon accepts only loopback `POST` JSON and forwards any bearer token for extension-side validation. |
| A web page issues loopback `fetch` to the port | Host **rejects requests with a browser `Origin` header** and sends no permissive CORS; data routes require a token the page cannot have. |
| Port exposed to other machines | Bind `127.0.0.1` only, never `0.0.0.0`. |
| Silent pairing by a background process | A human must read the code from the app and type it on the browser's Integrations page to Accept; short expiry + attempt cap. A grabbed code is useless without that human cross-surface step. |
| Token at rest | Stored hashed; plaintext returned once. |
| Replay / broad blast radius | Per-client tokens, scopes, revocation, and a second global opt-in before command execution. |

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
