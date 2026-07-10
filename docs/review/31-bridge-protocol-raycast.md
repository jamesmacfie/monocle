# 31 — Rust bridge, protocol package, Raycast client, nativeMessaging feature

Scope: `apps/bridge/src-tauri/`, `packages/native-bridge-protocol/`,
`apps/raycast/src/`, `apps/extension/background/features/nativeMessaging/`
(owned by this file per the README ownership rule), and the
`docs/native-messaging/` + `docs/raycast/` doc sets.

**Overall verdict: clean.** This area was pre-assessed as clean and the
assessment holds. The pre-review noted a smell in a `handler.ts` "orchestrating
pairing + pump + crypto + command bridging with no clear single seam" — **that
file does not exist**. The feature dir is already decomposed along exactly the
seams the smell asked for: `pump.ts` (validate + dispatch, pure),
`port.ts` (transport lifecycle), `pairing.ts`/`auth.ts`/`crypto.ts` (identity),
`suggestions.ts`/`execute.ts` (adapters over the command system),
`externalSuggestion.ts` (the one DTO boundary), `reconnect.ts` (durable
backstop). No code restructuring is recommended anywhere in this scope. The
findings below are one small correctness nit, one test gap, and doc-accuracy
fixes.

---

### BRIDGE-01: Fix the stale `confirmAction` contract in the protocol-authority docs

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
The implemented wire contract carries `confirmAction` on the DTO and
`confirmed` on the execute request:
`packages/native-bridge-protocol/src/wire.ts:76-81 (ExternalSuggestion)`,
`packages/native-bridge-protocol/src/wire.ts:156-161 (ExecuteParams)`. The
extension maps it out
(`apps/extension/background/features/nativeMessaging/externalSuggestion.ts:77-79
(toExternalSuggestion)`), the policy honors it
(`apps/extension/background/automations/runCommandPolicy.ts:112
(checkRunCommandPolicy)`,
`apps/extension/background/features/nativeMessaging/execute.ts:62-79
(executeForActiveTab)`), and Raycast implements the confirm flow
(`apps/raycast/src/components/CommandRow.tsx:113-130 (CommandActions)`).

But the **protocol authority** says the opposite in three places:

- `docs/native-messaging/protocol.md:230-232 (The ExternalSuggestion DTO)` —
  the "Dropped entirely" list includes `confirmAction`.
- `docs/native-messaging/protocol.md:179-182 (commands/execute (v2))` — the
  params comment says "v2: id only", omitting `confirmed`.
- `docs/native-messaging/execution.md:118-119 (The bridge execution policy)`
  and `docs/native-messaging/execution.md:209-215 (confirmAction and
  incognito)` — both state `confirmAction` commands are unconditionally denied
  with "no way to surface and resolve the confirmation from Raycast in v2".

Meanwhile `docs/raycast/execution.md:85-106 (Confirming destructive commands)`
documents the implemented confirm flow correctly, directly contradicting the
folder that declares itself the authority.

**Why it matters**
`docs/native-messaging/` is explicitly the behavioral protocol authority
(`docs/raycast/README.md:74-81`). An engineer extending the bridge or writing a
new client from the authority docs would believe destructive commands are
unreachable and `confirmed` does not exist — and might "add" a confirmation
mechanism that already exists, or treat the Raycast docs as wrong. This is a
security-relevant contract, so the authority being stale is worse than usual.

**Proposed change**
Three verbatim edits, all in `docs/native-messaging/`:

1. `protocol.md` — in the `commands/execute` example, replace the params
   comment and example:

   ```jsonc
   // params — form values are not carried over the wire, so submit commands
   // are denied by default. `confirmed: true` is required for any command
   // whose suggestion carries `confirmAction: true` (the client must confirm
   // with the user first); without it the command is refused (`forbidden`).
   { "id": "copy-title-and-url-as-markdown" }
   ```

2. `protocol.md` — in the DTO section: add to the example object the line
   `"confirmAction": true,            // optional; destructive — client must confirm, then send confirmed:true`
   and in the mapping rules replace the `confirmAction` entry in the
   "Dropped entirely" bullet with a new bullet:

   ```markdown
   - `confirmAction` ← carried through (emitted only when `true`) so a client
     can confirm a destructive command with the user before sending
     `confirmed: true` on `commands/execute`.
   ```

3. `execution.md` — replace the policy bullet
   "`confirmAction: true` → denied (no in-browser confirmation path from the
   app; see below)." with:

   ```markdown
   - `confirmAction: true` → denied **unless** the request carries
     `confirmed: true` (the client confirmed with the user; see
     [protocol.md](./protocol.md) `commands/execute`).
   ```

   and replace the first bullet of "## `confirmAction` and incognito" with:

   ```markdown
   - **`confirmAction` commands require client-side confirmation.** The
     suggestion carries `confirmAction: true`; the client must confirm with
     the user and send `confirmed: true` on `commands/execute`, or the command
     is refused (`forbidden`). This carries the palette's confirm contract
     across the bridge (`runCommandPolicy.ts`, `executionMode: "bridge"`;
     Raycast implements it with `confirmAlert` — see
     [../raycast/execution.md](../raycast/execution.md)). There is no
     in-browser confirmation step.
   ```

**Do NOT change / risks**
Do not touch the wire types or the policy code — they are correct and tested
(`execute.test.ts` covers both denied-unconfirmed and runs-when-confirmed).
Do not change `docs/raycast/execution.md`; it is already accurate.

**Verification**
Re-read the three edited sections against
`wire.ts`, `runCommandPolicy.ts:112`, and `CommandRow.tsx` — the three sources
must agree. No build/test impact.

**Related**
File 40 (doc accuracy owner) should note this folder was corrected here.

---

### BRIDGE-02: `touchLastUsed` writes a stale config snapshot and can undo a concurrent revoke

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
`apps/extension/background/features/nativeMessaging/auth.ts:64-67
(authenticate)` fires `void touchLastUsed(config, matched.instanceId, now)`
with the config object read at the **start** of authentication.
`auth.ts:70-82 (touchLastUsed)` then writes `{ ...config, pairedClients }`
back wholesale. If the user clicks Revoke on the Integrations page (or any
other config write lands) between that read and this write, the stale snapshot
is written back — resurrecting the just-revoked client, so its token
authenticates again until the user revokes a second time.

**Why it matters**
Revocation is the documented kill switch for a paired app's token
(`docs/native-messaging/authentication-and-security.md:105-107 (Tokens)`).
The race window is small (one hash await plus storage latency) and the effect
is visible (the client reappears in the list), but a security-posture control
that can silently un-apply is the wrong place to accept a read-modify-write
race. The fix costs a few lines and leaves the storage shape untouched.

**Proposed change**
In `auth.ts`, make `touchLastUsed` self-contained: drop the `config`
parameter, re-read fresh config inside, and no-op if the client is gone:

```ts
const touchLastUsed = async (instanceId: string, now: number): Promise<void> => {
  const config = await getFeatureConfig<NativeMessagingConfig>(
    NATIVE_MESSAGING_FEATURE_ID,
    nativeMessagingConfigDefaults,
  )
  if (!config.pairedClients.some((c) => c.instanceId === instanceId)) {
    return // revoked while this request was in flight — do not resurrect
  }
  await setFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, {
    ...config,
    pairedClients: config.pairedClients.map((c) =>
      c.instanceId === instanceId ? { ...c, lastUsedAt: now } : c,
    ),
  })
}
```

Call site becomes `void touchLastUsed(matched.instanceId, now)`. Export
`touchLastUsed` for the new test (matches the existing `permittedByGrants`
export-for-test pattern in `suggestions.ts:54`).

**Do NOT change / risks**
This narrows, not eliminates, the window — `chrome.storage` has no
transactions, and read-modify-write is the accepted repo-wide config pattern;
do not build a locking/queueing layer for it. Two concurrent authenticated
requests overwriting each other's `lastUsedAt` is harmless and stays as-is.
Storage shape and keys unchanged.

**Verification**
Existing `nativeMessaging.test.ts` "revoking a client invalidates its token"
stays green. Add to `nativeMessaging.test.ts`:
`"lastUsedAt touch does not resurrect a revoked client"` — pair, revoke, call
`touchLastUsed(instanceId, now)` directly, assert the client is still absent
from config.

**Related**
None.

---

### BRIDGE-03: No unit coverage of the daemon's HTTP transport rules

**Priority:** P3     **Effort:** S     **Type:** test-gap

**Current state**
`apps/bridge/src-tauri/src/daemon.rs:414-481 (tests)` covers `deliver`
id-routing, `select_relay`, and `display_name` (8 fns; plus 2 in
`framing.rs:46-68 (tests)` — 10 total, not the "4 tests" the root `CLAUDE.md`
baseline states). The security-relevant transport rules in
`daemon.rs:296-356 (handle_rpc)` — the `Origin` rejection (403), bearer-token
injection into `env.auth`, missing-`id` 400, and the protocol-shaped
`error_envelope` for no-browser — are exercised only by the manual headless
script and the `curl` checklist in
`docs/raycast/testing-and-troubleshooting.md:80-89 (Origin rejection (must
verify))`, which itself labels Origin rejection "must verify".

**Why it matters**
These rules are the daemon's entire security contribution
(`docs/native-messaging/native-host.md:104-125 (Loopback server)`). A refactor
of `handle_rpc` (e.g. for M2 named-pipe work) could drop the `Origin` check or
the token injection and every existing test would stay green.

**Proposed change**
Add axum handler tests to the existing `mod tests` in `daemon.rs` using
`tower::ServiceExt::oneshot` on the `Router` (add `tower` as a
`dev-dependency`), no real sockets:

- `rpc_rejects_origin_header` — POST `/` with `Origin: https://evil.example`
  → 403.
- `rpc_rejects_missing_id` — POST `/` with `{"v":1,"method":"status"}` → 400.
- `rpc_no_browser_returns_not_enabled_envelope` — POST `/` with a valid
  envelope and no relays → body parses as
  `{ok:false, error:{code:"not_enabled"}}` echoing the request `id`.
- Token injection: extract the envelope mutation (parse body → inject
  `env.auth` from the header) into a small pure fn if needed for a direct
  test, or assert via a registered fake relay writer.

**Do NOT change / risks**
Do not restructure `handle_rpc` beyond what a pure-fn extraction for the
token-injection assertion strictly requires; the guard list bans style
rewrites of the Rust bridge. Keep the manual checklist — it still owns the
cross-process round-trip.

**Verification**
`cargo test` in `apps/bridge/src-tauri` passes with the new tests; update the
"Last verified validation" test count in the root `CLAUDE.md` when it changes.

**Related**
File 41 (testing gaps). Root `CLAUDE.md` "cargo test (4 tests)" is already
stale (10 today) — file 40/root owner.

---

### BRIDGE-04: Purge pre-Direction-B "pairing modal" remnants from two docs

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
Pairing was redesigned as Direction B (app displays the code; human types it
on the Integrations page) and the implementation contains no surface/modal
push (`grep upsertSurface` over `features/nativeMessaging/` — zero hits;
`pairing.ts:1-9` header describes Direction B). Two docs still describe the
old modal flow:

- `docs/native-messaging/bridge-app-prd.md:217-224 (§7 What the app must NOT
  do)` — "the extension shows the modal; the caller types it back" (the exact
  inverse of Direction B).
- `docs/native-messaging/extension-integration.md:97-105 (Pairing modal)` — a
  whole section on pushing a `modal` surface on `pair/request`, plus the reuse
  table row `Pairing modal | upsertSurface(...)` at line 81, plus the
  pending-state shape at lines 33-34 which omits the implemented
  `status`/`approvedToken` fields
  (`apps/extension/background/features/nativeMessaging/types.ts:65-73
  (PendingPairing)`), plus the "Implemented files" list at lines 122-141 which
  omits `commands.ts`, `reconnect.ts`, and `types.ts`.

**Why it matters**
`docs/raycast/pairing.md:53-55` explicitly says "Direction B removed the
pairing modal", so the doc set contradicts itself; a reader of
extension-integration.md would go looking for surface code that does not
exist.

**Proposed change**
1. `bridge-app-prd.md` §7, replace the second bullet with:
   `- Never make a pairing decision or verify the code (the app displays the
   code returned by \`pair/request\`; the human types it on the browser's
   Integrations page — Direction B, see
   [authentication-and-security.md](./authentication-and-security.md)).`
2. `extension-integration.md`: delete the "## Pairing modal" section and the
   `Pairing modal | upsertSurface` reuse-table row; extend the pending-state
   line to
   `{ pairingId, codeHash, expiresAt, attempts, status, approvedToken?, client }`;
   add `commands.ts` (enable/disable palette commands), `reconnect.ts`
   (chrome.alarms reconnect heartbeat), and `types.ts` (config/state shapes)
   to the Implemented files list.
3. Also update the README gap bullet `docs/native-messaging/README.md:68
   (Known gaps)` — "Pairing fallback page for tabs without a `SurfaceHost`" is
   obsolete for the same reason (Direction B needs no page-hosted surface);
   delete it.

**Do NOT change / risks**
`docs/native-messaging/authentication-and-security.md` and the
`docs/raycast/` pairing docs are already correct — leave them.
`../surfaces.md` cross-links elsewhere in the folder are about surfaces
generally and stay.

**Verification**
`grep -rn "modal" docs/native-messaging/` returns no pairing-flow hits after
the edit.

**Related**
BRIDGE-01 (same doc set), file 40.

---

### BRIDGE-05: Post-collection `pair/poll-status` returns `rejected`, not `expired` — fix the comment and checklist

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
`packages/native-bridge-protocol/src/wire.ts:123-131 (PairPollStatusResult)`
comment says the token is delivered once and "subsequent polls return
`expired`". The implementation drops the record on read, and an unknown
`pairingId` returns `rejected`
(`apps/extension/background/features/nativeMessaging/pairing.ts:176-205
(pollStatus)`). `docs/raycast/testing-and-troubleshooting.md:46-48
(End-to-end checklist step 4)` repeats "the next poll returns expired".

**Why it matters**
Any client treats both as terminal, so no behavior bug — but a wire-contract
comment that mispredicts an observable response trains readers to distrust
the (otherwise excellent) contract comments, and a checklist runner will
think the flow misbehaved.

**Proposed change**
1. `wire.ts` comment, replace the last clause with: `subsequent polls return
   \`rejected\` (the record no longer exists).`
2. `testing-and-troubleshooting.md` step 4, replace
   `(token delivered ONCE; the next poll returns expired)` with
   `(token delivered ONCE; the next poll returns rejected)`.

**Do NOT change / risks**
Do not "fix" the code to return `expired` instead — `rejected` is the honest
answer for an unknown id and the raycast client treats all terminal states
identically (`apps/raycast/src/pair-monocle.tsx:56-66 (PairForm)`).

**Verification**
Comment-only; `pnpm run tsc` in the package stays green.

**Related**
BRIDGE-01, file 40.

---

### BRIDGE-06: native-host.md's endpoint list omits `GET /instances`

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
`docs/native-messaging/native-host.md:120 (Loopback server)` says "Expose
only `POST /` for RPC and `GET /status` for daemon-level liveness." The
daemon also serves `GET /instances`
(`apps/bridge/src-tauri/src/daemon.rs:180-184 (run)`), documented correctly
in `docs/native-messaging/multi-instance.md:43-49` and
`docs/raycast/protocol-client.md:36-42 (Endpoints)`.

**Why it matters**
"Expose only" is an exhaustive security claim in the transport-rules section;
being wrong by one route undermines exactly the sentence a security reviewer
relies on.

**Proposed change**
Replace the bullet with: `- Expose only \`POST /\` for RPC, \`GET /status\`
for daemon-level liveness, and \`GET /instances\` for the connected-browser
list (both GETs are daemon-local and unauthenticated; see
[multi-instance.md](./multi-instance.md)).`

**Do NOT change / risks**
None.

**Verification**
The three docs listing endpoints now agree.

**Related**
File 40.

---

## Future-alignment notes (M2–M4, not current refactor recommendations)

Cross-referenced to `docs/native-messaging/bridge-app-prd.md:301-313 (§12
Milestones)`. None of these warrant changes now — the guard list bans
pre-abstracting for one platform — but an M2/M3 implementer should know where
the macOS-only assumptions live:

- **M2 (Windows/Linux) — paths.** `apps/bridge/src-tauri/src/paths.rs:5-23
  (home/sock_path/discovery_path)` is Unix-only: `HOME` is `expect`ed (panics
  on Windows where it may be unset) and there is **no named-pipe path** — the
  PRD's `\\.\pipe\monocle-bridge` (§9) exists only in the doc.
- **M2 — transport types.** `relay.rs:12-22 (run)` and `daemon.rs:150-175
  (run)` use `UnixStream`/`UnixListener` directly; Windows needs cfg-gated
  named-pipe equivalents. The framing codec (`framing.rs`) is already
  transport-generic (`AsyncRead`/`AsyncWrite`) — the right seam exists.
- **M2 — registry.** `registry.rs:76-82 (chrome_dir/firefox_dir)` hardcodes
  macOS `Library/Application Support` paths (module doc says macOS-only);
  Linux paths and the Windows registry writes come from the table in
  `native-host.md:69-77 (Registration paths)`. The daemon's
  already-running probe (`daemon.rs:156-163 (run)`) is UDS-connect-based and
  needs a named-pipe equivalent.
- **M3 (signing/auto-update).** `registry.rs:16-23 (register_all)` writes
  `current_exe()` and re-runs on every launch, so a moved/updated binary
  self-heals — good. Unsigned builds are exposed to macOS app-translocation
  baking a randomized path into manifests; notarization (M3) resolves this.
  The protocol needs **no** version negotiation for bridge auto-update: the
  daemon/relay are byte-transparent (route by `id` only), so only a framing
  change would couple them — already stated at `bridge-app-prd.md:223-224`.
- **M4 follow-up (profile-level identity).** `daemon.rs:49-60 (RelayEntry /
  DaemonState.relays)` keys relays by lowercased browser name; profiles and
  channels collapse (last relay wins). This is deliberate and documented
  (`multi-instance.md:63-68 (Identity granularity)`); the v_next spec
  (`name+profile` key) fits the current structure without rework, and the
  Raycast picker renders whatever `/instances` returns.
- **Chrome `key` pin** remains the tracked hard blocker
  (`registry.rs:37-55 (register_all)`; `CLAUDE.md` baseline; store-submission
  memory).

## Non-findings (reviewed, justified)

- **`daemon.rs` at ~480 LOC mixing HTTP server + UDS listener + handshake +
  tray mirror** — each concern is a small, well-commented unit around one
  shared `DaemonState`; splitting would scatter that state for no reader
  benefit, and the guard list bans style rewrites of the Rust bridge.
- **No `handler.ts` god-orchestrator in `features/nativeMessaging/`** — the
  reported smell is refuted; the dir is already split along
  transport/dispatch/identity/adapter seams (see verdict above).
- **Raycast imports the wire contract via a deep relative path**
  (`apps/raycast/src/lib/types.ts:1-19`) instead of the package name —
  deliberate: `apps/raycast` is excluded from the pnpm workspace (locked
  decision, `docs/raycast/README.md:28-32`), and `wire.ts` is dependency-free
  by explicit contract (`wire.ts:1-3`), so the import bundles safely and no
  type is redefined.
- **Protocol version/compat story for M3/M4** — adequate as-is: `v` literal +
  `meta/info.protocolVersions` probe + the additive-fields-don't-bump rule
  (`protocol.md:50-51`), and the bridge is version-agnostic; no mechanism or
  further doc needed.
- **Modulo bias in `generatePairingCode`** (`crypto.ts:6-16`) — already
  ponytail-annotated; negligible for a 60s, attempt-capped, human-confirmed
  code.
- **Tray menu rebuilt by a 2s polling thread** (`main.rs:209-229
  (build_tray)`) — crude but main-thread-safe and change-detected; an
  event-driven channel adds cross-thread machinery for zero user-visible
  gain.
- **Three separate error-code→title switches in Raycast**
  (`lib/execute.ts:12-30`, `components/BrowserCommands.tsx:170-192`,
  `components/CommandList.tsx:102-114`) — each is surface-specific user copy,
  not shared logic; merging would couple unrelated wording.
- **`pump.ts` reads feature config up to twice per request**
  (`isEnabled`/`isExecutionEnabled`, `pump.ts:51-56`) — storage-backed reads
  are cheap and the two predicates read clearer than a threaded config param.
- **`bridgeDeniedIds` module-level cache never invalidated**
  (`suggestions.ts:33-43`) — `external.allowed` is a static property of the
  context-free `allCommands` import; there is nothing to invalidate on.
- **Raycast docs embed near-verbatim code snippets** (`pairing.md`,
  `protocol-client.md`, `suggestions-and-navigation.md`) — drift risk in
  principle, but every snippet matched the implementation at review time and
  they are labeled sketches; the tutorial value outweighs the risk for a
  dev-mode-only client.
- **`bridge.ts` maps `ECONNREFUSED` to `not_enabled`**
  (`lib/bridge.ts:80-93 (bridgeRequest)`) — intentional collapsing of "app
  not running" and "no browser" into one user story, documented in
  `protocol-client.md:206-210`.
