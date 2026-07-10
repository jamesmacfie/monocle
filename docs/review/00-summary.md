# Maintainability Review — Master Summary

This is the prioritized index of every finding from the July 2026
maintainability review. Read `README.md` first for conventions (finding
template, priority/effort rubric, guard list). Each finding lives in full in
its owning file; this page is the map and the suggested order of attack.

## What the review found, in one paragraph

Monocle is, on the whole, well-factored — and the review is as notable for what
it *refused* to flag as for what it found. The three biggest "hotspots" seeded
into the passes were largely **refuted**: `automations/engine.ts` is cohesive
apart from ~130 lines of tab-navigation plumbing (not a god-object);
`navigation.slice.ts` is one coherent state machine that would be *worse* if
split; the automations `editorState.ts` is already pure transforms, not an
imperative tangle; the workflow executor holds its lockstep invariant op-for-op;
and the Rust bridge, protocol package, and Raycast client are clean. The real,
actionable problems cluster in four places: (1) **the palette search input**
runs a redundant, race-prone DOM-sync layer that can drop the first keystroke
after navigation; (2) **cross-process storage writes** for settings and feature
config aren't consistently locked, risking lost writes; (3) **a transport-layer
size guard contradicts the schema** and silently rejects valid snippets; and
(4) a half-finished **"user-scripts" → "automations" rename** leaves misleading
names throughout the automations code. Beyond those, the findings are mostly
small, high-confidence dedup/dead-code/doc-truth cleanups. Nine `*.slice`/engine
subsystems were reviewed against their docs; ~30 doc claims were found stale and
are specced for verbatim rewrite.

## Totals

| Priority | Count | Meaning |
| --- | --- | --- |
| **P0** | 5 | Correctness risk on a hot path — do first |
| **P1** | 15 | High comprehension/safety payoff, mostly S/M effort |
| **P2** | 39 | Real cleanups, scoped |
| **P3** | 34 | Polish, dead code, doc truth-ups |
| **Total** | **93** | across 11 subsystem files + docs/tests/future |

`TEST-01…20` (file 41) are the consolidated, risk-ranked **verification
companions** — most protect a specific code finding elsewhere (noted in each
row). They are counted above but are not separate refactors; they are the tests
you write to prove the fix. `FUT` (file 42) produced **zero** new findings: the
end-to-end traces were clean and every existing finding was verified not to
block documented future work.

## P0 — do first (correctness on a hot path)

| ID | Title | Effort | File |
| --- | --- | --- | --- |
| PAL-01 | Collapse palette search onto a single owner; remove the `ignoreSearchUpdate` DOM dance (drops the first keystroke after navigation; the input is *already* controlled, so the layer is both redundant and harmful) | M | 20 |
| MSG-01 | Align the transport 10 KB string guard with the schema's 100 KB snippet limit (valid snippets are rejected before the schema that allows them runs) | S | 12 |
| FEAT-01 | Make palette enable/disable of Extension Integrations run the same disable cleanup as the settings page (diverging paths leave stale registered commands) | S | 13 |
| TEST-01 | Pin that the first keystroke after palette navigation is not dropped (protects PAL-01; the nearest existing test *masks* the bug with a 120 ms sleep) | S | 41 |
| TEST-02 | Pin that a snippet longer than the transport guard still saves (protects MSG-01) | S | 41 |

## P1 — high payoff

| ID | Title | Effort | File |
| --- | --- | --- | --- |
| CMD-01 | Extract a shared permission-gated command-tree walker (query.ts favorites + resolve walks; `walkGroups` deliberately excluded) | M | 10 |
| MSG-02 | Unify the thrown-handler error shape between Chrome and Firefox (Firefox rejects the promise where Chrome resolves `{error}`; 11 handlers) | S | 12 |
| MSG-03 | Make router dispatch compile-time exhaustive + twin-check the two message unions | S | 12 |
| MSG-04 | Type the store-side send boundary (`any` feeds the most-validated seam) | M | 12 |
| FEAT-02 | Add locked read-modify-write helpers for feature config/state; convert the unlocked mutation paths | M | 13 |
| KEY-01 | Extract a shared keybinding-capture hook behind the two live capture UIs | M | 14 |
| SHELL-01 | Extract a shared `useExecuteCommand` hook for both palette shells | M | 21 |
| TEST-03 | Pin the rate limiter and size-guard rejection path | S | 41 |
| TEST-04 | Pin the cross-browser thrown-handler error shape (`runtime.ts`) | S | 41 |
| TEST-05 | Pin that a concurrent settings write keeps command settings (protects STATE-01) | M | 41 |
| TEST-06 | Pin that concurrent feature config/state writes both land (protects FEAT-02) | S | 41 |
| TEST-07 | Cover `content/automationTriggers.ts` — throttle, oncePerPage, SPA re-arm | M | 41 |
| TEST-08 | Cover untested engine ops, runtime limits, snippet-counter reuse (protects AUTO-08) | M | 41 |
| TEST-09 | Unit-test the pure keybinding conflict engine `conflicts.ts` (protects KEY-03) | S | 41 |
| TEST-10 | Pin import-disarm safety + editor round-trip (protects EDIT-03) | S | 41 |

## P2 — scoped cleanups

| ID | Title | Effort | Type | File |
| --- | --- | --- | --- | --- |
| CMD-02 | Extract deep-search-inheritance + permission-gate helpers | S | dedupe | 10 |
| CMD-03 | Split `searchIndex.ts` into pure build vs cache lifecycle | M | decompose | 10 |
| CMD-04 | Fix misleading "replaces the previous tree walks" header comment | S | doc-rewrite | 10 |
| CMD-05 | Correct invalidation list + document real cache layers in search-and-ranking.md | S | doc-rewrite | 10 |
| AUTO-01 | Extract tab-navigation wait primitives from engine.ts | S | decompose | 11 |
| AUTO-02 | Record step outcomes uniformly on host-access failure (`HostAccessError`) | S | consistency | 11 |
| AUTO-03 | Give the engine-op set a single source of truth | S | dedupe | 11 |
| AUTO-04 | Finish the user-scripts → automations naming migration in code | M | consistency | 11 |
| AUTO-08 | Cover untested engine ops, runtime limits, content trigger service | M | test-gap | 11 |
| MSG-05 | Delete the dead validation/messaging helpers | S | dead-code | 12 |
| MSG-06 | Split transport guards out of `validation.ts`; rename `validateSender` | S | decompose | 12 |
| MSG-07 | Stop logging full message payloads on every dispatch | S | consistency | 12 |
| MSG-08 | Correct four inaccuracies in `docs/messaging.md` | S | doc-rewrite | 12 |
| FEAT-03 | Rewrite the stale storage-contract prose | S | doc-rewrite | 13 |
| KEY-02 | Adopt the CMD-01 shared walker in `keybindings/source.ts` | M | dedupe | 14 |
| PAL-02 | Fix shadow-DOM-broken `document.querySelector` in multi-select focus | S | consistency | 20 |
| PAL-03 | Delete dead, shadow-broken `onInlineInputKeyDown` | S | dead-code | 20 |
| PAL-06 | Correct `palette-ui-and-navigation.md` (controlled input, dead path, reducer list) | S | doc-rewrite | 20 |
| SHELL-02 | Replace the `id.includes("clock"\|"settings")` reload heuristic (redundant with storage listener) | S | consistency | 21 |
| SHELL-03 | Extract the ambient page-listener mount into one shared component | S | dedupe | 21 |
| SHELL-04 | Extract a shared `useDocumentTheme` hook (new-tab + options) | S | dedupe | 21 |
| EDIT-01 | Consolidate per-op editor knowledge into a typed step-editor registry | M | decompose | 22 |
| EDIT-02 | Make every documented step op addable; remove the silent toast fallback | S | consistency | 22 |
| EDIT-03 | Add import-sanitization + editor round-trip tests | S | test-gap | 22 |
| STATE-01 | Route `settings.slice` writes through the background message layer (lost-write hazard) | M | consistency | 23 |
| STATE-02 | Collapse the async-thunk message envelope into a `createMessageThunk` factory | M | dedupe | 23 |
| WF-03 | Cover executor retry/backoff + peer-extension invoke transport | M | test-gap | 30 |
| BRIDGE-01 | Fix the stale `confirmAction` contract in the protocol-authority docs | S | doc-rewrite | 31 |
| DOCS-01 | Correct the workflow step vocabulary in architecture.md (missing `uncheck`) | S | doc-rewrite | 40 |
| DOCS-03 | Fix the stale "validates nothing" claim in site-sdk-security.md | S | doc-rewrite | 40 |
| DOCS-05 | Adopt a top-of-file architecture-block convention; fill the ~10 gaps | M | consistency | 40 |
| TEST-11 | Cover workflow executor retry/backoff + peer-extension invoke transport | M | test-gap | 41 |
| TEST-14 | Router-exhaustiveness / twin-union drift as a compile-time gate | S | test-gap | 41 |
| TEST-15 | Reducer/thunk tests for the async slices via a shared factory | M | test-gap | 41 |
| TEST-16 | Parity + inheritance tests for the shared command-tree walker | M | test-gap | 41 |
| TEST-17 | Shared execute→refresh→close policy + new-tab storage re-hydration | S | test-gap | 41 |
| TEST-12 | Pin the daemon's `handle_rpc` transport rules + handshake fallback | S | test-gap | 41 |
| TEST-18 | `useKeybindingCapture` hook behavior | S | test-gap | 41 |
| TEST-19 | Extension-Integrations palette disable runs the same cleanup as settings | S | test-gap | 41 |

## P3 — polish, dead code, doc truth-ups

| ID | Title | Effort | Type | File |
| --- | --- | --- | --- | --- |
| CMD-06 | Update the `source.ts` excerpt in authoring-commands.md | S | doc-rewrite | 10 |
| CMD-07 | Delete the dead `findCommand` barrel export | S | dead-code | 10 |
| CMD-08 | Retire the deprecated `getFaviconUrl` alias (rename; 3 live sites) | S | dead-code | 10 |
| CMD-09 | Extract row-action-menu construction out of `commandsToSuggestions` | S | decompose | 10 |
| AUTO-05 | Reuse `resolveSnippetValue` for the `insertSnippet` engine op | S | dedupe | 11 |
| AUTO-06 | Remove dead `getAutomation` export + `interpolatableStrings` re-export | S | dead-code | 11 |
| AUTO-07 | Replace the hand-rolled step walk in `commands.ts` with `walkAutomationSteps` | S | dedupe | 11 |
| MSG-09 | Dedupe URL-rules value validation (boundary vs handler) | S | dedupe | 12 |
| FEAT-04 | Replace hand-rolled `toast` helpers with `sendToastToActiveTab` | S | dedupe | 13 |
| FEAT-05 | Fail loudly when a feature declares `automations` without `settings` | S | consistency | 13 |
| KEY-03 | Add direct unit tests for the pure conflict engine `conflicts.ts` | S | test-gap | 14 |
| KEY-04 | Correct three stale details in `docs/keybindings.md` | S | doc-rewrite | 14 |
| PAL-04 | Delete the unused `useSearchInput` hook | S | dead-code | 20 |
| PAL-05 | Drop the redundant `pages` prop from `CommandContent` | S | consistency | 20 |
| SHELL-05 | Document that `commandPaletteState` is content-overlay-only | S | consistency | 21 |
| SHELL-06 | Centralize `isNewTab` context stamping in the new-tab shell | M | consistency | 21 |
| SHELL-07 | Use `getBrowserAPI().runtime` consistently in the listener components | S | consistency | 21 |
| EDIT-04 | Extract duplicated validation-issue grouping in AutomationEditorPage | S | dedupe | 22 |
| EDIT-05 | Use the exported validation caps in TriggersEditor instead of re-hardcoding | S | consistency | 22 |
| EDIT-06 | Show the current icon in the editor's icon select when outside the curated list | S | consistency | 22 |
| STATE-03 | Extract the four verbatim `setUpdating`/`updatingIds` toggler copies | S | dedupe | 23 |
| WF-01 | Move duplicated `validateCallbackCommands` into the shared external provider | S | dedupe | 30 |
| WF-02 | Consolidate the `missingElementResult` helper into `dom.ts` | S | dedupe | 30 |
| BRIDGE-02 | `touchLastUsed` writes a stale config snapshot; can undo a concurrent revoke | S | consistency | 31 |
| BRIDGE-03 | No unit coverage of the daemon's HTTP transport rules | S | test-gap | 31 |
| BRIDGE-04 | Purge pre-Direction-B "pairing modal" remnants from two docs | S | doc-rewrite | 31 |
| BRIDGE-05 | Post-collection `pair/poll-status` returns `rejected`, not `expired` | S | doc-rewrite | 31 |
| BRIDGE-06 | native-host.md's endpoint list omits `GET /instances` | S | doc-rewrite | 31 |
| DOCS-02 | Refresh CLAUDE.md "cargo test (4 tests)" → 10 | S | doc-rewrite | 40 |
| DOCS-04 | Remove the "(Automations)" title residue in automations.md + README index | S | doc-rewrite | 40 |
| DOCS-06 | Write down the JSDoc convention; delete restating comments; add ~4 boundary doc-comments | S | consistency | 40 |
| DOCS-07 | Sweep the "automation automation" / "a automation" rename residue in comments | S | doc-rewrite | 40 |
| TEST-13 | Pin the `touchLastUsed` revoke race + minor extension-side bridge gaps | S | test-gap | 41 |
| TEST-20 | `FeatureModule` loud-failure when `automations` declared without `settings` | S | test-gap | 41 |

## Dependency-aware implementation order

Findings that must (or should) land in a set:

1. **Walker chain:** CMD-01 → CMD-02 → KEY-02. (KEY-02 asks CMD-01's `WalkNode`
   for one extra `deepSearchEnabled` field routed through CMD-02's helper.)
   TEST-16 pins parity across the three former walks.
2. **Send-boundary typing:** MSG-04 first, then STATE-02 and SHELL-06 tighten
   against it — do not run them concurrently on the same files. STATE-01 rides
   MSG-04 too.
3. **Capture hook:** KEY-01 → KEY-04 and PAL-03/PAL-06 (KEY-01 makes the
   line-230 doc claim true; the shared hook removes CommandPalette's
   capture-lock special-casing). TEST-18 pins the hook.
4. **Locked storage:** FEAT-02 establishes the locked read-modify-write pattern;
   STATE-01 copies it on the UI side. TEST-05/06 pin both.
5. **Engine op-set:** AUTO-03 → AUTO-04 (single source makes the rename safe).
6. **Palette P0:** PAL-01 with TEST-01; do the manual content×new-tab matrix in
   the finding (this is the one behavioral redesign in the review).
7. **Shells:** SHELL-01 with TEST-17; SHELL-02 depends on the new-tab storage
   listener already re-hydrating settings (verify, then delete the heuristic).

## Pre-work guide — "before you start plan X, do finding Y"

From the future-alignment pass (file 42), the low-cost findings that make a
documented future plan materially cheaper, in order:

1. **Extension-extension type package** → MSG-03 (drift-proof the wire) → WF-01 →
   WF-03 → FEAT-01.
2. **Settings-page phase 4 (schema-driven settings)** → FEAT-02 is the
   locked-RMW pattern to copy → STATE-01.
3. **Settings-page phase 7 (automations JS flavor)** → AUTO-03 (single op set) →
   AUTO-04 (finish rename).
4. **Bridge native-messaging M2 (cross-platform)** → BRIDGE-03 guards the
   `handle_rpc` refactor → MSG-06.
5. **Site-SDK Tier-2 hardening** → WF-01 (one shared choke point) + apply file
   30's item-2.7 doc fix (DOCS-03).

No finding conflicts with a documented future plan — verified in file 42, not
merely asserted. Two findings' "Do NOT change" sections actively guard future
work (EDIT-01 keeps step editors page-local for a future phase-6 consumer;
FEAT keeps `focus/block.ts:isUrlBlocked` intact).

## File map

`10` commands/search · `11` automations · `12` messaging/validation ·
`13` features/storage · `14` keybindings · `20` palette/navigation ·
`21` shells · `22` automations editor · `23` UI state · `30` workflows/site SDK ·
`31` bridge/protocol/raycast · `40` docs & comments · `41` testing gaps ·
`42` future-expansion alignment.
