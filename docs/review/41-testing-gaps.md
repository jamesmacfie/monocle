# Testing gaps — risk-ranked register (`TEST`)

This file consolidates every test gap flagged by the eleven subsystem passes
(files 10–31) into one register, ranked by **risk = (severity of the bug an
absent test would let through) × (churn / blast-radius of the code)**. Each
entry names the test file to create or extend, the single behavior it pins, and
the finding ID it protects (Related). No entry recommends a coverage percentage
or "add tests for module X" without a named behavior — that is a review-value
violation, not a finding.

The subsystem passes each own their finding's *Verification* section; this file
is the cross-pass, risk-ordered view an implementer uses to decide **what to
write first**. Where a subsystem finding already names the exact test, this file
cites it and does not restate the spec — it ranks it.

## Coverage map (verified 2026-07-02)

Test files: **102**, all green. Test cases: **720** (`pnpm test` →
`102 passed / 720 passed`). Distribution by area (source `.ts`/`.tsx` excluding
`.test.*` vs co-located test files):

| Area | Source files | Test files | Shape |
| --- | --- | --- | --- |
| `background/` | 227 | 65 | Dense (~29% of files carry a test; the risk-bearing pure modules are well covered) |
| `shared/` | 117 | 27 | Moderate — utils/hooks/types covered; slices and palette-DOM thin |
| `content/` | 17 | 5 | Sparse — `automationTriggers.ts` has **zero** tests |
| `options/` | 36 | 2 | Very sparse — automations editor ~zero tests |
| `newtab/` | 7 | 2 | Sparse |
| `entrypoints/` | 5 | 0 | None (thin shims — see Non-findings) |

The known shape holds: background is dense, UI shells / content / options are
thin. Rust bridge: **10** test functions (`daemon.rs` 8, `framing.rs` 2), all
`cargo test`-green.

**Doc count discrepancies (accurate numbers for file 40 / DOCS to fix):**

- Root `CLAUDE.md` "Last verified validation … `pnpm test` (703 tests)" — actual
  is **720**. The doc fix is owned by file 40; this is the accurate number.
- Root `CLAUDE.md` "`apps/bridge`: `cargo test` (4 tests)" — actual is **10**
  test functions (`grep -rE '#\[test\]|#\[tokio::test\]' apps/bridge/src-tauri/src`).
  Doc fix owned by file 40 (also flagged by BRIDGE-03).

## Test-infrastructure assessment

Existing Vitest infra (jsdom environment, co-located `.test.ts(x)`,
`*.dom.test.tsx` for React-Testing-Library component tests) is **sufficient for
every P0/P1 gap below**. No new framework, runner, or harness is required.

The one genuine infra gap is a **shadow-DOM integration harness**: the palette
runs in a *closed* shadow root in content mode, but every `*.dom.test.tsx` runs
in jsdom light DOM, so the shadow-DOM-broken `document.querySelector` bugs
(PAL-02, PAL-03) are invisible to the suite and can only be caught manually.
**This harness is deliberately NOT recommended as a finding** — the only
findings that need it (PAL-02/PAL-03) are P2 and are verified manually per their
own Verification sections (guard list: no test-infra churn beyond what a P0/P1
needs). It is recorded here so a future reviewer does not re-derive the gap or
build the harness speculatively. If a *P0/P1* shadow-DOM correctness bug is ever
found, revisit this decision.

---

### TEST-01: Pin that the first keystroke after palette navigation is not dropped

**Priority:** P0     **Effort:** S     **Type:** test-gap

**Current state**
`CommandPalette.dom.test.tsx:103-129` ("Backspace with a non-empty search edits
text instead of navigating") masks the dropped-first-keystroke bug with a 120 ms
`setTimeout` and a comment (`:112-116`). There is **no** test that types
immediately after entering a group. PAL-01 confirms the `ignoreSearchUpdate` DOM
dance drops the first post-navigation keystroke (a live P0 bug); the sleep exists
to hide it.

**Why it matters**
This is the single highest-risk gap: an active correctness bug on the palette's
hottest path (every group navigation) with no test, and the one existing nearby
test actively conceals it. Without a pinning test, PAL-01's fix could regress
silently or the sleep could be reintroduced.

**Proposed change**
Per PAL-01's Verification: remove the 120 ms workaround and its comment from the
`:103-129` test, and add a new `CommandPalette.dom.test.tsx` case "first
keystroke immediately after entering a group is not dropped" — navigate into a
group, type with no delay, assert the page's `searchValue` equals the typed
text. Keep green: "navigating into a group … clears the search input"
(`:52-67`), "Backspace on an empty nested search … restores the parent search"
(`:69-101`), the Escape test (`:131-149`).

**Do NOT change / risks**
This test lands as part of PAL-01 (it is that finding's acceptance gate) — do
not add the test against the current buggy code, it will fail. Order: implement
PAL-01, then this test proves it.

**Verification**
`CommandPalette.dom.test.tsx` green with the sleep removed; `navigation.slice.test.ts`
untouched. Manual regression matrix (content overlay + new-tab) per PAL-01.

**Related**
PAL-01 (P0, owns the fix + spec). This is the risk-ranked pointer to it.

---

### TEST-02: Pin that a snippet longer than the transport guard still saves

**Priority:** P0     **Effort:** S     **Type:** test-gap

**Current state**
`background/utils/validation.ts:42` sets `MAX_STRING_LENGTH = 10000` and rejects
any string field over it (`:88`), but the snippet schema allows 100k. No test
covers the transport size guard at all — `background/utils/validation.test.ts`
exercises only business validation (keybindings, command-setting shapes, URL
rules, permission grants; `:10-178`), never the size or rate guards. MSG-01
confirms this rejects legitimate large snippets before the schema that permits
them.

**Why it matters**
P0 correctness bug (valid data silently rejected) on the message boundary every
UI write crosses, with zero coverage. The bug and its guard live in the same
untested block, so any fix or constant move (MSG-06) is unprotected.

**Proposed change**
Add to `background/utils/validation.test.ts` (or the new
`background/utils/sizeGuards.test.ts` if MSG-06 splits the file): a
`monocle-snippet-save`-shaped message carrying a >10k-character body passes the
transport guard and reaches schema validation. Per MSG-01's Verification.

**Do NOT change / risks**
Lands with MSG-01 (the fix aligns the guard with the schema limit). Writing it
first against current code documents the bug; keep it red until MSG-01 lands, or
land together.

**Verification**
New test green after MSG-01; existing `validation.test.ts` and
`background/messages/deleteSnippet.test.ts` stay green. Manual: save a >10k-char
snippet from the options Snippets page.

**Related**
MSG-01 (P0, owns fix), MSG-06 (moves the constant), TEST-03 (same untested guard
block).

---

### TEST-03: Pin the rate limiter and the size guard's rejection path

**Priority:** P1     **Effort:** S     **Type:** test-gap

**Current state**
`background/utils/validation.ts:38` (`RATE_LIMIT_MAX = 1000` per minute per
sender) and the oversize-string rejection (`:88`) have **zero** coverage
(confirmed: `validation.test.ts` never references rate/size). These are the
extension's abuse guards.

**Why it matters**
Security/abuse-facing behavior with no test: a regression that disables the
limiter or inverts the size comparison would pass CI silently. Distinct behavior
from TEST-02 (which pins the *false-positive* bug); this pins the guards *doing
their job*.

**Proposed change**
Two cases in `validation.test.ts` (or `sizeGuards.test.ts` post-MSG-06): (1) the
1001st message from one sender within a minute is rejected while the 999th is
accepted (drive the module clock / counter per its existing `setInterval`
cleanup at `:380`); (2) a non-snippet string field over `MAX_STRING_LENGTH` is
rejected. Each asserts one behavior.

**Do NOT change / risks**
Do not couple to TEST-02's snippet exemption — after MSG-01, snippets are exempt
by a higher limit, other fields are not; this test pins the *general* field
guard, so use a generic string field, not a snippet body.

**Verification**
`pnpm test`; mutation spot-check: raise `RATE_LIMIT_MAX` and confirm case (1)
fails.

**Related**
MSG-01, MSG-06, TEST-02.

---

### TEST-04: Pin the cross-browser thrown-handler error shape (`runtime.ts`)

**Priority:** P1     **Effort:** S     **Type:** test-gap

**Current state**
`background/utils/runtime.ts` (`createCrossBrowserMessageHandler`) has **no test
file** (verified: no `runtime.test.ts`). MSG-02 confirms Firefox rejects the
listener promise where Chrome resolves `{ error }` (`runtime.ts:140` vs
`:129-137`), affecting 11 throwing handlers — an unhandled-rejection divergence
invisible to the current suite (which runs one browser shim).

**Why it matters**
The single transport primitive every message flows through, untested, with a
known cross-browser behavior split. A Firefox-only unhandled rejection surfaces
as a silent failure in the options UI.

**Proposed change**
Add `background/utils/runtime.test.ts` per MSG-02: with a mocked Firefox
environment, a handler that throws resolves the listener's returned promise to
`{ error: <message> }` (not a rejection). Add the Chrome-path twin asserting the
same resolved shape.

**Do NOT change / risks**
`executeKeybinding.ts` has its own try/catch and is unaffected — do not fold it
in (owned by file 14).

**Verification**
New test green after MSG-02's fix; manual Firefox check per MSG-02.

**Related**
MSG-02 (P1, owns fix), MSG-08 (documents the wrapped/unwrapped split).

---

### TEST-05: Pin that a concurrent settings write does not lose command settings

**Priority:** P1     **Effort:** M     **Type:** test-gap

**Current state**
`settings.slice` does an unlocked read-modify-write on `monocle-settings` from
the UI process while `background/commands/settings.ts` has locked equivalents
under `withStorageLock`. No test covers the cross-process lost-write hazard.
STATE-01 routes the UI write through the locked background updater and names the
exact regression test.

**Why it matters**
A genuine lost-write hazard on shared storage — a theme write from the UI can
clobber a concurrent command-settings write on the same key. High blast radius
(all settings) and a data-loss class of bug; the test is the regression anchor.

**Proposed change**
Per STATE-01: add `background/messages/settings.test.ts` asserting
`monocle-settings-update` with a theme patch calls the locked updater and leaves
a pre-existing `commands` entry on the same key untouched (write a `commands`
entry, update theme, assert both survive).

**Do NOT change / risks**
Requires STATE-01's message-layer route to exist first; the test pins that
route, not the current direct-write.

**Verification**
New test green; manual theme persistence + new-tab re-hydration per STATE-01.

**Related**
STATE-01 (P2, owns fix), TEST-06 (FEAT-02 is the background twin of this
lost-write class), MSG-04 (send-boundary typing the new message rides).

---

### TEST-06: Pin that concurrent feature config/state writes both land

**Priority:** P1     **Effort:** S     **Type:** test-gap

**Current state**
FEAT-02 adds locked read-modify-write helpers for feature config/state and
converts the unlocked mutation paths; the concurrency regression is currently
untested. Same lost-write class as TEST-05, on `monocle-feature-config` /
`monocle-feature-state`.

**Why it matters**
Unlocked RMW on feature storage means two near-simultaneous mutations (e.g. a
palette toggle and a surface gesture) can drop one edit. Feature storage backs
every feature module; a silent dropped write is hard to reproduce and diagnose.

**Proposed change**
Per FEAT-02's Verification: in `background/features/registry.test.ts`, fire two
concurrent `updateFeatureConfig` mutators for the same feature (`Promise.all`)
and assert both edits land; in `extensionRegistry.test.ts`, two concurrent
`addPendingPeer` calls for different peers both appear in `listPendingPeers()`.

**Do NOT change / risks**
These pin FEAT-02's helpers — write against the converted code, not the current
unlocked paths.

**Verification**
Existing `registry.test.ts`, `tabGroups.test.ts`, `elementHider.test.ts`,
`extensionRegistry.test.ts`, `storageArea.test.ts`, `storageMutex.test.ts` stay
green.

**Related**
FEAT-02 (owns fix), TEST-05 (UI-side twin), FEAT-01.

---

### TEST-07: Cover `content/automationTriggers.ts` — throttle, oncePerPage, SPA re-arm

**Priority:** P1     **Effort:** M     **Type:** test-gap

**Current state**
`content/automationTriggers.ts` has **zero** tests (verified: no test file). It
runs a shared `MutationObserver` for all `elementAppears` selectors with
per-trigger throttling (`:88` floor 250 ms), per-document `oncePerPage`
bookkeeping (`:78,87,125,155,182,198`), and SPA re-arm on navigation. AUTO-08
flags all of it.

**Why it matters**
This is privileged-adjacent content code that arms page triggers — mis-firing
(re-firing a `oncePerPage` trigger, ignoring the throttle floor, failing to
re-arm on SPA navigation) directly causes automations to run wrongly or not at
all. Zero coverage on a subtle timing/observer module is the highest-risk
content-side gap.

**Proposed change**
Add `content/automationTriggers.test.ts` (jsdom) pinning three behaviors: (1) a
`oncePerPage` trigger fires once and is skipped on a second matching mutation
(`:125,182,198`); (2) the throttle floor clamps a sub-250 ms `throttleMs` and
suppresses checks inside the window (`:88,185`); (3) `armTriggers` re-arms after
a simulated SPA navigation clears `fired` state. Use fake timers + a manual
MutationObserver dispatch.

**Do NOT change / risks**
Do not test against a real browser observer; drive the observer callback
directly. This is a test-only addition — no source change.

**Verification**
`pnpm test` count rises; mutation spot-check: break the 250 ms `Math.max` floor
and confirm case (2) fails.

**Related**
AUTO-08 (owns the gap list). Parallel to TEST-08 (engine-side automations
coverage).

---

### TEST-08: Cover untested engine ops, runtime limits, and snippet-counter reuse

**Priority:** P1     **Effort:** M     **Type:** test-gap

**Current state**
AUTO-08 lists untested engine paths: the `while` op, `forEach`-over-variable,
`insertSnippet` (both paths), `showSurface`/`hideSurface`, the 5000-step cap,
`runningRuns` concurrency drop, the structural re-check refusal, and
`alarms.runStartupScripts`. `engine.test.ts` covers the common ops but not these
control-flow / limit / surface branches.

**Why it matters**
The automation engine runs privileged ops between content segments under
runtime limits; an unbounded loop, an un-dropped concurrent run, or a bypassed
step cap is a resource-exhaustion / correctness risk. High churn (engine is the
automations hot path) and correctness-critical branches.

**Proposed change**
Per AUTO-08 and AUTO-05's Verification, add `engine.test.ts` cases: `while`
terminates at `loopCap`; `forEach` iterates a variable array; `insertSnippet`
with a `{i}` body bumps the shared counter once (AUTO-05); `showSurface` then
`hideSurface` mutate the surface store; a 5001-step document is refused;
`runningRuns` at capacity drops a new invocation; the run-time
`collectStructuralIssues` re-check refuses a tampered document. Optionally the
cheaper `tabNavigation.test.ts` for the AUTO-01 wait primitives.

**Do NOT change / risks**
Do not rewrite the engine's cohesive switch to make it testable — these branches
are already reachable via `runAutomation` with typed invocations (see file 11
non-findings). Test through the public entry.

**Verification**
`pnpm test` count rises; mutation spot-check: break `loopCap` default and confirm
a test fails (AUTO-08).

**Related**
AUTO-08, AUTO-05 (snippet counter), AUTO-01/02 (nav-wait + host-access
outcomes), TEST-07 (content-trigger twin).

---

### TEST-09: Unit-test the pure keybinding conflict engine (`conflicts.ts`)

**Priority:** P1     **Effort:** S     **Type:** test-gap

**Current state**
`background/keybindings/conflicts.ts` (`evaluateKeybindingAssignment` at `:44`,
`isProperStrokePrefix` at `:21`) has **no co-located test** (verified) — it is
exercised only transitively via `registry.test.ts` and the message-handler
tests. KEY-03 flags it directly.

**Why it matters**
This pure function decides whether a keybinding assignment is blocked (exact
conflict), shadows a sequence prefix, or is allowed — the core of the capture
UIs. Prefix logic is subtle (proper-prefix vs equality); a regression silently
lets conflicting bindings through or blocks valid ones. Pure, deterministic, and
cheap to pin — high value, low effort.

**Proposed change**
Per KEY-03: add `background/keybindings/conflicts.test.ts` covering
`isProperStrokePrefix` (equal strokes are not a proper prefix; shorter-prefix
true; non-prefix false) and `evaluateKeybindingAssignment` (exact conflict
blocks; sequence-prefix shadow reported with type; requirement-violation vs
warning distinction; clean assignment allowed).

**Do NOT change / risks**
No source change — `conflicts.ts` is correctly factored (file 14 non-finding 9).
Pure test addition.

**Verification**
`pnpm test` includes the new file; `pnpm run tsc`.

**Related**
KEY-03 (owns), KEY-01 (both capture UIs consume this engine's full output).

---

### TEST-10: Pin import-disarm safety and editor round-trip for automations

**Priority:** P1     **Effort:** S     **Type:** test-gap

**Current state**
The automations editor has ~zero tests. Two safety-critical behaviors are
unpinned: `prepareImportedDraft` disarming non-manual triggers on import
(`importExport.ts`), and the assemble/disassemble round-trip. EDIT-03 flags both.

**Why it matters**
Import disarm is a **security contract**: an imported automation with a live
page/schedule trigger must arrive disarmed, or importing a shared document
silently arms code against the user. The round-trip guards that editing a
document does not corrupt it. Both are correctness-critical and currently rely
on no test.

**Proposed change**
Per EDIT-03: add `options/pages/automations/editorState.test.ts` (or the
finding's named files) asserting (1) `prepareImportedDraft` disarms every
non-manual trigger; (2) `assembleDraft(editorStateFromScript(x)) === x` over the
`EXAMPLE_AUTOMATIONS` corpus; (3) every `STEP_OP_OPTIONS` default row validates
against `AutomationStepSchema`; (4) `collectTemplateWarnings` namespace cases.

**Do NOT change / risks**
The round-trip must run over the real `EXAMPLE_AUTOMATIONS` data (locked by
`examples.test.ts`) — do not hand-write fixtures that miss control-flow ops.

**Verification**
`pnpm test`; mutate `prepareImportedDraft` to skip disarming and confirm the
suite fails (EDIT-03).

**Related**
EDIT-03 (owns), EDIT-01/EDIT-02 (share `editorState.test.ts`).

---

### TEST-11: Cover the workflow executor retry/backoff and peer-extension invoke transport

**Priority:** P2     **Effort:** M     **Type:** test-gap

**Current state**
The workflow executor's retry/backoff policy has **zero** coverage, and
`background/commands/extensionSdk/transport.ts` has **no test file** (verified).
WF-03 flags both, plus a weak `blur` assertion in `ops.test.ts`.

**Why it matters**
Retry/backoff governs how a workflow tolerates a transiently-missing element;
a broken exponent or a lost-response race (`settled` guard) causes hangs or
double-execution. The peer-extension transport is the untested wire for the
extension-to-extension future work.

**Proposed change**
Per WF-03: cover the executor's `2 ** completedAttemptIndex` backoff schedule
and the `settled`/late-reply guard (a reply after timeout is ignored); add a
transport test for `extensionSdk` invoke (request/response correlation,
timeout). Tighten the `blur` assertion in `ops.test.ts`.

**Do NOT change / risks**
No source change; the lockstep invariant already holds (file 30 non-finding 1).

**Verification**
`pnpm test` count rises; mutation spot-check per WF-03 (change the backoff
exponent → backoff test fails; break `settled` → late-reply test fails).

**Related**
WF-03 (owns), file 42 (de-risks extension-extension future work).

---

### TEST-12: Pin the daemon's `handle_rpc` transport rules and handshake fallback

**Priority:** P2     **Effort:** S     **Type:** test-gap

**Current state**
The bridge daemon's `handle_rpc` transport rules are untested (BRIDGE-03), as are
`handshake()` parse/timeout fallback and `write_discovery`. Current bridge
coverage is `daemon.rs` (8) + `framing.rs` (2) = 10 test fns.

**Why it matters**
The daemon routes RPC between browser instances and the relay; a transport-rule
regression (wrong routing, mis-parsed handshake) breaks the native bridge
silently. Bridge is Partial (M0/M1) and about to grow (M2–M4), so the transport
core is high-churn.

**Proposed change**
Per BRIDGE-03: add `cargo` tests in `apps/bridge/src-tauri` for `handle_rpc`
routing rules and the `handshake()` timeout/parse fallback. Update the root
`CLAUDE.md` test count when it changes (doc fix owned by file 40).

**Do NOT change / risks**
Do not refactor `daemon.rs` for testability (guard list bans Rust-bridge style
rewrites; file 31 non-finding). Add tests around the existing shape.

**Verification**
`cargo test` in `apps/bridge/src-tauri` passes with the new tests.

**Related**
BRIDGE-03 (owns), TEST-13 (extension-side bridge gaps).

---

### TEST-13: Pin the `touchLastUsed` revoke race and minor extension-side bridge gaps

**Priority:** P3     **Effort:** S     **Type:** test-gap

**Current state**
BRIDGE-02: `touchLastUsed` writes a stale config snapshot and can undo a
concurrent revoke — untested. Also flagged (file 31 test-gap notes): `port.ts`
backoff, same-`instanceId` pairing supersede, search-path denied-id filtering.

**Why it matters**
The revoke race can silently resurrect a revoked (untrusted) client — a security
regression — but it is narrow (one accessor) and low-churn, hence P3.

**Proposed change**
Per BRIDGE-02: add to `nativeMessaging.test.ts` a case "lastUsedAt touch does not
resurrect a revoked client" — pair, revoke, call `touchLastUsed(instanceId, now)`
directly, assert the client stays absent from config. Optionally the `port.ts`
backoff and supersede cases.

**Do NOT change / risks**
Lands with BRIDGE-02's fix (touch must lock/re-read). Raycast has no tests by
deliberate design (dev-mode) — do not add any.

**Verification**
Existing "revoking a client invalidates its token" stays green; new case green
after BRIDGE-02.

**Related**
BRIDGE-02 (owns).

---

### TEST-14: Router-exhaustiveness / twin-union drift is a compile-time gate, not a runtime test

**Priority:** P2     **Effort:** S     **Type:** test-gap

**Current state**
MSG-03 replaces the router's `.otherwise` with `.exhaustive` and adds a
`Message ↔ ValidatedMessage` twin assertion. There is no runtime test for this —
and there should not be; it is enforced by `tsc`.

**Why it matters**
Drift between the two message unions (a variant added to one, not the other)
today fails silently at runtime. MSG-03 turns it into a build error. Recording
it here prevents a future reviewer from writing a redundant runtime test for a
compile-time invariant.

**Proposed change**
No runtime test. The acceptance check *is* MSG-03's Verification: temporarily add
a dummy variant to `MessageSchema` only and confirm both the router and the twin
assertion fail `pnpm run tsc`. Document that this gate replaces a test.

**Do NOT change / risks**
Do not add a runtime "all handlers registered" test — it duplicates what
`.exhaustive` proves and rots.

**Verification**
`pnpm run tsc` fails on the injected dummy variant; full suite stays green.

**Related**
MSG-03 (owns), MSG-04 (both lean on `Message` being trustworthy).

---

### TEST-15: Reducer/thunk tests for the async slices via a shared factory

**Priority:** P2     **Effort:** M     **Type:** test-gap

**Current state**
Only `navigation.slice.test.ts` exists; `settings`, `settingsCatalog`,
`snippets`, `automations`, and `features` slices are untested at the
reducer/thunk level. STATE-02 introduces a `createMessageThunk` factory and
STATE-03 a shared `updatingIds` toggler — both need tests, and testing the
factory once covers the envelope for all five slices.

**Why it matters**
The message-envelope handling (fulfilled / `{ error }` rejection / thrown
transport) is duplicated across slices and drives every options-page write; a
regression there breaks CRUD silently. Testing the *factory* pins the behavior
once instead of chasing five copies (the review-value win of STATE-02).

**Proposed change**
Per STATE-02/STATE-03: add `shared/store/messageThunk.test.ts` (fulfilled path,
`{ error }`-envelope rejection, thrown-transport rejection asserting
`fallbackError`) and `shared/store/updatingIds.test.ts` (add, add-again
idempotent, remove, remove-absent).

**Do NOT change / risks**
Do not write five near-identical slice suites — pin the shared factory/toggler,
which is exactly what STATE-02/03 create. Land alongside those findings.

**Verification**
`pnpm run tsc`, `pnpm test`; existing options flows behave identically.

**Related**
STATE-02, STATE-03 (own the factories), MSG-04 (tightens the factory's types).

---

### TEST-16: Parity + inheritance tests for the shared command-tree walker

**Priority:** P2     **Effort:** M     **Type:** test-gap

**Current state**
`traversal.test.ts` covers only leaf helpers. CMD-01 extracts a shared
permission-gated walker and CMD-02 shared deep-search-inheritance helpers, both
consumed by `query.ts` and (via KEY-02) `keybindings/source.ts`. There is no
parity test between `findFavoritedCommands` breadcrumbs and the `searchIndex`
nested-favorite names, and `usage.ts` `calculateTimeBoost` (`usage.ts:57`) is
untested.

**Why it matters**
The walker is adopted by both the command-loading path and the keybinding path;
a subtle divergence (a permission gate applied at the wrong level, a deep-search
group descended incorrectly) silently changes which commands appear. Parity
tests are the guard that the extraction preserved behavior across both consumers.

**Proposed change**
Per CMD-01/CMD-02/KEY-02: add to `traversal.test.ts` — descend blocked by
missing permission; failing `children()` skips subtree without sinking siblings;
`"stop"` short-circuits; breadcrumb order; URL-filtered child excluded; and a
6-case `shouldDeepSearchGroup` true/false/undefined × inherited matrix. Add a
parity test asserting `getCommandCollections` favorites and `resolveCommandById`
output are deep-equal before/after the refactor, and a KEY-02 case asserting
deep-search-gated descent matches the pre-refactor keybinding entries. Add a
`usage.ts` `calculateTimeBoost` unit test.

**Do NOT change / risks**
`walkGroups` is deliberately excluded from the walker dedup (file 10
non-finding 1) — do not add parity tests that assume it uses the shared walker.

**Verification**
`command-system.test.ts`, `searchIndex.test.ts`, `registry.test.ts`,
`container-keybinding.test.ts` stay green (the parity gate).

**Related**
CMD-01, CMD-02, KEY-02.

---

### TEST-17: Shared execute→refresh→close policy and new-tab storage re-hydration

**Priority:** P2     **Effort:** S     **Type:** test-gap

**Current state**
No test covers the execute→refresh→close policy in either palette shell; no test
asserts new-tab settings re-hydrate via the `chrome.storage.local.onChanged`
listener (the path SHELL-02 relies on after removing the `id.includes` reload
heuristic); no per-shell ambient-listener-set regression test (SHELL-03).

**Why it matters**
The close-vs-refresh policy governs whether the palette closes after an action
in both shells; SHELL-01 extracts it into a shared hook, and the storage-listener
re-hydration is what makes SHELL-02's heuristic removal safe. Untested, the
removal could regress the clock/theme live-update.

**Proposed change**
Per SHELL-01: add `commandExecution.test.ts` cases — refresh is skipped when
`navigateBack && !alwaysRefreshAfterSuccess`; refresh runs when
`alwaysRefreshAfterSuccess`; `onClose` fires only when `navigateBack`. Per
SHELL-02: a test that a `monocle-settings` `onChanged` event re-hydrates new-tab
settings (the clock/theme live-update path).

**Do NOT change / risks**
The per-shell listener-set difference (new-tab omits `CopyPageAsMarkdownListener`)
is intentional (SHELL-03) — pin it as a regression, do not "fix" it.

**Verification**
`pnpm run tsc`; manual per SHELL-01/SHELL-02 (both shells).

**Related**
SHELL-01, SHELL-02, SHELL-03.

---

### TEST-18: `useKeybindingCapture` hook behavior

**Priority:** P2     **Effort:** S     **Type:** test-gap

**Current state**
There is no test for keybinding-capture UI behavior; the two live capture UIs
duplicate the state machine. KEY-01 extracts a shared `useKeybindingCapture`
hook and names its test.

**Why it matters**
Capture behavior (append stroke, conflict-blocks-save, requirement-violation vs
warning, Backspace pops a stroke, Escape cancels) is user-facing and currently
duplicated across two UIs where the options dialog silently drops
`conflictType`/`warnings`. The hook + test unify and pin it.

**Proposed change**
Per KEY-01: add `useKeybindingCapture.test.ts` (jsdom) — append stroke →
normalized keybinding; Enter with conflict does not call `onComplete`; Backspace
pops a stroke and re-checks; Escape calls `onCancel`; requirement violation
blocks save; warnings do not block save.

**Do NOT change / risks**
Lands with KEY-01 (the hook must exist first). `KeybindingTemplateDialog.tsx` is
not a capture UI (file 14 non-finding 1) — do not test it here.

**Verification**
`pnpm run tsc`, `pnpm test`, then content + new-tab + options smoke per KEY-01.

**Related**
KEY-01 (owns), TEST-09 (the conflict engine this hook consumes).

---

### TEST-19: Extension-Integrations palette disable runs the same cleanup as settings

**Priority:** P2     **Effort:** S     **Type:** test-gap

**Current state**
FEAT-01: enabling/disabling Extension Integrations from the palette must run the
same disable cleanup as the settings page; the palette path is currently untested
and (per FEAT-01) skips the cleanup.

**Why it matters**
If the palette disable path leaves peer commands registered, disabling via
palette leaves stale peer commands live — a confusing, permission-adjacent state
divergence between two entry points to the same toggle.

**Proposed change**
Per FEAT-01: in `extensionRegistry.test.ts`, approve a peer, register a tree,
execute `external-extensions-disable`, assert `getAllExtensionEntries()` is empty
and `loadExtensionSdkCommands()` returns `[]`. Keep existing dispose/handler
tests green.

**Do NOT change / risks**
Lands with FEAT-01. Coordinate with the Native Messaging twin (file 31) but do
not merge the two features.

**Verification**
Existing extensionRegistry tests stay green; manual enable/disable via palette.

**Related**
FEAT-01 (owns), FEAT-04 (toast helper cleanup in the same commands).

---

### TEST-20: `FeatureModule` loud-failure when `automations` declared without `settings`

**Priority:** P3     **Effort:** S     **Type:** test-gap

**Current state**
FEAT-05: a feature declaring `automations` without `settings` should fail loudly;
today it silently contributes nothing. Untested.

**Why it matters**
A misconfigured feature module currently fails silently — the automations never
register and no error is logged, a confusing authoring trap. Low blast radius
(registry projection), hence P3.

**Proposed change**
Per FEAT-05: add a `registry.test.ts` case — a stub module with `automations`
and no `settings` passed through the projection helper logs an error and
contributes nothing.

**Do NOT change / risks**
The consuming merge in `automations/registry.ts` needs no change (file 13 note).

**Verification**
`pnpm test` includes the new case.

**Related**
FEAT-05 (owns).

---

## Non-findings (reviewed, justified)

1. **Blanket coverage targets for `options/` and `content/` (36/2 and 17/5).**
   Low file-level coverage is not itself a finding — every real gap in those
   areas is captured as a named-behavior entry above (TEST-07 automationTriggers,
   TEST-10 editor safety, TEST-17 shells). A "raise options coverage to N%"
   recommendation would violate the review's no-blanket-target rule.
2. **Shadow-DOM integration harness.** Recorded in the Test-infrastructure
   section: the only findings needing it (PAL-02/PAL-03) are P2 and verify
   manually. Building it now is speculative infra (guard list). Revisit only if a
   P0/P1 shadow-DOM correctness bug appears.
3. **`entrypoints/*/main.tsx` (0 tests).** One-line shims over `newtab/`,
   `content/`, `options/` (file 21 non-finding) — no logic to pin.
4. **Raycast client (0 tests).** Deliberate: `apps/raycast` is a dev-mode client
   excluded from the workspace (file 31 non-finding). Do not add tests.
5. **`navigation.slice` staleness guards.** File 20 non-finding 1 confirms all
   three race guards exist and are tested (`navigation.slice.test.ts:152-253`,
   `CommandPalette.dom.test.tsx:151-199`). The two guards without a *dedicated*
   unit test are covered transitively; TEST-01 adds the one genuinely missing
   behavior (first-keystroke survival). No separate finding for the guards.
6. **`key-normalizer.ts`, `event-filter.ts`, `execution.ts` generated-action
   dispatch.** Already well-pinned (file 14 non-findings 3/8, file 10
   non-finding 8) — big-but-linear, tested, no gap.
7. **Router "all handlers registered" runtime test.** Superseded by TEST-14's
   compile-time gate; a runtime version would duplicate `.exhaustive` and rot.
