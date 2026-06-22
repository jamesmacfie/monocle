# Roadmap and open questions

> **Status: v1 implemented; this file lists what remains.** See [README.md](./README.md).

## Phasing

### Phase 0 — Provider refactor (prerequisite)

Extract the shared external-command provider from the site SDK with no behavior
change. This is the gate for everything else. See
[provider-refactor.md](./provider-refactor.md). Acceptance: full `pnpm test`
green with no test edits beyond import-path moves; site SDK behaves identically.

### Phase 1 — Read/contribute commands (the feature)

- `extensionSdk` durable registry + cross-extension transport.
- External-message handler (`announce`/`register`/`update`/`dispose`/`ping` +
  invoke port), allowlist-gated.
- Extensions feature module + settings page (enable, pending/approved
  `record-list`, approve/dismiss/revoke).
- Manifest `externally_connectable` (Chrome) + optional `management` for eager GC.
- Caps, rate limits, invoke timeout, lazy + eager GC, settings prune on revoke.
- Tests: schema validation + caps, allowlist gating, conversion via the shared
  engine with a fake extension transport, GC, settings prune. Manual cross-browser
  checklist in [registration-and-trust.md](./registration-and-trust.md).

This phase ships the feature as scoped in [README.md](./README.md).

### Phase 2+ — Deferred

- **Per-request token / signed requests** — defense in depth on top of id-trust.
  The protocol already reserves `auth?: {token}`. Useful if id-trust ever proves
  insufficient (e.g. to bind a specific peer *build*), but not needed for v1.
- **Root placement for peer commands** — gated on anti-clutter/anti-spoofing UX
  (provenance affordances, a per-peer "allow at root" toggle). Until then all
  peer commands live under a labelled per-peer group.
- **Peers contributing features / automations** — a much larger surface (settings
  schemas, lifecycle, the automation engine's trust model). Explicitly out of
  scope; revisit only with a concrete need.
- **Extracted protocol package** — promote `shared/types/externalCommands.ts` (and
  the envelope) into a published `@monocle/*` package once a second real consumer
  exists. Until then, peers copy/generate the types (see
  [author-guide.md](./author-guide.md)).
- **Conflict resolution** — when two peers register colliding names/keywords.
  v1 relies on namespacing + provenance; a later pass could add disambiguation or
  per-peer ordering controls.
- **Bridge transport adapter** — if a desktop app ever needs to register commands
  (not just read them), the `ExternalProviderAdapter` seam could host a bridge
  transport. Not planned; noted because the seam makes it cheap.

## Open questions

1. **Publishing Monocle's id to peers.** Chrome ids are stable once the signing
   key is pinned; the Chrome `key`/id is still unpinned (see the Native Bridge
   notes in `CLAUDE.md`). Peers need a stable Monocle id to message. Resolve the
   `key` pin (shared concern with the native bridge) before publishing a peer SDK.
2. **`externally_connectable` breadth vs store review.** Broad `{"ids":["*"]}`
   simplifies discovery but may draw Chrome reviewer questions
   ([../store-submission.md](../store-submission.md)). Decide between open +
   handler-gated vs a curated id list with a submission process for peers.
3. **GC without `management`.** Lazy GC (drop after N failed invokes) is the
   floor; is that responsive enough, or should revoke be the primary path and
   uninstall-cleanup best-effort?
4. **Provenance UI.** Exactly how prominently to show "from `<peer>`" on rows and
   in the action menu so impersonation is obvious without cluttering the palette.
5. **Result delivery for returned values.** Reuse the bridge's clipboard/return
   delivery seam, or define a peer-specific delivery (e.g. always show in a
   modal)? Depends on the first real data-producing peer command.

## Relationship to existing work

- **Site SDK** ([../site-sdk.md](../site-sdk.md)) — the direct ancestor; Phase 0
  refactors it into the shared engine this feature also uses.
- **Native bridge** ([../native-messaging/README.md](../native-messaging/README.md))
  — the structural sibling for the feature module + settings + (omitted here)
  pairing; shares the `CommandResult` return channel and the optional-permission
  grant flow, and the unresolved Chrome `key` pin.
</content>
