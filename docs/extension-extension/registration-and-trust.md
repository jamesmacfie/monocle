# Registration, trust, and security

> **Status: proposed — not built.** See [README.md](./README.md).

This doc covers the lifecycle of a peer (discovery → approval → registration →
revocation/GC), the durable stores behind it, and the security model — including
the attacker model, the Firefox transport gap, and why the approval gate alone is
sufficient.

## Trust model: the extension id is the identity

When one extension messages another, the browser sets `sender.id` to the
**sender's extension id**, and the receiver cannot be lied to about it — it is
assigned by the browser from the extension's signing key (Chrome) / gecko id
(Firefox), not chosen by the sender at runtime. This is the entire basis of the
trust model:

- A peer's identity is its `sender.id`. No pairing code or token is needed to
  *establish* identity — unlike the native bridge, where a desktop app has no
  browser-verified identity and must prove itself with a code → token exchange.
- The only thing the user decides is **authorization**: "do I allow the extension
  with this id to contribute commands?" That decision is a single approval on the
  Extensions settings page.

So the trust gap the bridge's pairing code closes (binding an anonymous localhost
caller to a token) **does not exist here**. Adding a code would be ceremony
without security benefit. (A per-request token is still a sensible *defense in
depth* option for later — see [roadmap.md](./roadmap.md) — but is not needed for
v1.)

## Lifecycle

### 1. Discovery (announce)

A loaded peer sends an unauthenticated `announce` (see
[protocol.md](./protocol.md)). Monocle:

- Validates the envelope and the display-only `manifest` (name/icon/description).
- Records a **pending** entry keyed by `sender.id`, holding the claimed manifest
  and a first-seen timestamp.
- Returns `{status: "pending"}` (or `"approved"` if the id is already on the
  allowlist).

Pending entries are display-only and trust nothing. They are capped (e.g. ≤50
pending) and rate-limited per id to prevent a hostile extension from flooding the
list.

### 2. Approval (user action)

The user opens **Settings → Extensions**, sees the pending peer (with its claimed
name/icon, clearly labelled *"as claimed by `<extId>`"* and the raw id shown),
and clicks **Approve**. This:

- Moves the id from pending → the durable **allowlist**.
- Optionally pushes a confirming `modal` Surface (the same primitive the native
  bridge pairing prompt uses) summarising what approval grants.
- Lets the peer's next `register` succeed.

Approval is the only thing that authorizes a peer. Nothing a peer says before
approval has any effect beyond appearing in the pending list.

### 3. Registration

An approved peer sends `register` with its declarative tree. Monocle validates
(shared schema + caps), persists the tree under `extension:<extId>`, and
invalidates the search index. The commands now render in the palette — including
while the peer is later asleep (the tree is cached). See
[architecture.md](./architecture.md).

### 4. Revocation and GC

- **User revoke**: a per-row **Revoke** action on the settings page (the
  `record-list` pattern, same as the bridge's per-client Revoke) removes the id
  from the allowlist, deletes its cached tree, and clears its surfaces. The
  user's keybindings/url-rules against that peer's command ids become inert
  (and are pruned — see below).
- **Dispose**: a peer may clear its own commands via the `dispose` message
  without losing approval.
- **Dead-owner GC**: a peer can be uninstalled while Monocle still holds its tree
  and the user's per-id settings. Two mechanisms:
  - **Lazy**: when an invoke to a peer fails with "no such extension"
    (`runtime.lastError` / disconnect with no receiver), mark the owner dead;
    after N consecutive dead results, drop its cached tree.
  - **Eager (Chrome)**: if the optional `management` permission is granted,
    listen for `chrome.management.onUninstalled` and drop the owner immediately.
    Without `management`, lazy GC is the fallback (documented limitation).
  - Orphaned per-command settings (keybindings/url-rules/hidden) keyed under a
    dropped owner's ids are pruned on GC, reusing the settings prune semantics in
    `background/commands/settings.ts`.

## Durable stores

The Extensions feature is a feature module, so it uses the two existing feature
stores (see [../features.md](../features.md)) — no new top-level storage key:

- **`monocle-feature-config`** (durable), keyed by the feature id
  `external-extensions`:
  ```ts
  type ExternalExtensionsConfig = {
    enabled: boolean                 // master switch (off by default)
    approved: ApprovedPeer[]         // the allowlist
  }
  type ApprovedPeer = {
    extId: string                    // browser-verified id (identity)
    name: string                     // claimed display name at approval time
    icon?: CommandIcon
    approvedAt: number
    lastSeenAt?: number
  }
  ```
- **`monocle-feature-state`** (transient, cleared on startup), holding the
  **pending** announcements and per-id rate-limit counters. Pending entries are
  intentionally non-durable: a peer re-announces on load, so there is nothing to
  persist.

The **cached command trees** live in the `extensionSdk` durable registry (its own
storage, mirroring the site SDK's `registry.ts` but persisted rather than
in-memory), keyed by `extId` + `revision`. Kept separate from the feature config
so a large tree blob does not bloat the small allowlist record.

## The Firefox transport asymmetry

| | Chrome | Firefox |
| --- | --- | --- |
| `externally_connectable` manifest key | Supported; declares which ids/origins may message Monocle | **Not supported** |
| `onConnectExternal` / `onMessageExternal` | Yes | Yes |
| Enforcement point | Manifest **and** in-handler id check | **In-handler id check only** |

On Chrome, `externally_connectable` can pre-filter who may even reach Monocle's
external handlers, but it is a coarse allowlist (and you may not know peer ids
ahead of time). On Firefox there is no such key, so **the authoritative
allowlist check must live in the handler** on both browsers: reject any
`sender.id` that is not on the approved allowlist (for `register`/`invoke`),
while still accepting `announce` from any id (that is how discovery works).

Concretely: a new external-message handler (distinct from
`createCrossBrowserMessageHandler` in `background/utils/runtime.ts`, which
*rejects* all external senders by design) checks `sender.id` against the
allowlist for everything except `announce`. See
[extension-integration.md](./extension-integration.md).

## Threat model

**Attacker**: a malicious or compromised peer extension already installed in the
user's browser. (A peer that is *not* installed cannot message Monocle at all.)

| Threat | Mitigation |
| --- | --- |
| **Unapproved peer contributes commands** | Impossible: `register`/`invoke` require an approved `sender.id`; `announce` only adds a pending row. |
| **Spoofing another extension's identity** | Impossible: `sender.id` is browser-verified, not self-asserted. |
| **Impersonation via display name/icon** | The claimed name/icon are labelled "as claimed by `<extId>`" and the raw id is shown at approval and in the per-command provenance. The user approves an *id*, not a name. |
| **Privilege escalation through Monocle** | None: external commands carry no `permissions` and map to no privileged op. "Execute" is an outbound notification; the peer acts only with its own permissions. Same containment as the site SDK. |
| **Root-list clutter / phishing rows** | v1 forces all peer commands under a labelled per-peer group (no root placement); caps limit count/depth; provenance is always visible. |
| **Stale/poisoned cached tree** | Replace-whole `register` + a `revision`; the user can revoke at any time; GC drops dead owners. |
| **Resource exhaustion (announce/register floods)** | Per-id rate limits + pending cap + registration caps (≤20 regs, ≤100 cmds, depth ≤5). |
| **Hanging the palette via a slow/dead peer** | Invoke timeout (3s) → empty/error display row; root list never calls the peer. |
| **Untrusted callback output** | Every `children`/`search` result is re-validated (`allowPlacement:false`, full caps) before conversion. |

### What approval does NOT grant

Approving a peer does **not** give it any Monocle permission, access to the user's
tabs/history/bookmarks, the ability to read other commands, or the ability to run
privileged ops. It grants exactly one thing: its declared commands appear in the
palette, and selecting one notifies the peer. The peer's actual capabilities are
whatever permissions *it* holds in its own manifest — unchanged by Monocle.

## Manual checks (for when this is built)

- Approve a peer on Chrome and on Firefox; confirm `register` is rejected before
  approval and accepted after, on both.
- Confirm an unapproved id's `register`/`invoke` is rejected while its `announce`
  still appears as pending.
- Revoke a peer; confirm commands vanish, surfaces clear, and its keybindings are
  pruned.
- Uninstall a registered peer; confirm lazy GC drops it after failed invokes
  (and eager GC if `management` is granted on Chrome).
- Put a peer worker to sleep; confirm cached commands still render and that
  drilling into a callback group wakes it (or times out to a NoOp row).
</content>
