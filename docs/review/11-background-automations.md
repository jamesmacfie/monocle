# 11 — Background Automations (engine, triggers, lowering, policy)

Scope: `apps/extension/background/automations/` (engine, lowering, policy,
commands, registry, storage, alarms, conditions, interpolation, eligibility,
trigger engine), `apps/extension/content/automationTriggers.ts` (arming side),
and the shared contract files `apps/extension/shared/types/automations.ts` /
`automationValidation.ts` where they serve engine clarity. The automations
editor UI belongs to file 22; the content workflow executor to file 30.

Overall assessment: this subsystem is in good shape. Every module opens with an
accurate architecture block, the boundaries (content-lowered steps vs engine
ops, pull-based triggers, background re-validation, injected command bridge)
are deliberate and documented, and `docs/automations.md` matches the code
closely. The findings below are targeted: one modest extraction from the 1,027-
line engine, three consistency/drift hazards, small dedupe/dead-code items, a
naming migration left half-finished, and test gaps. The seeded "engine bundles
≥5 responsibilities" hypothesis is **partially refuted** — see AUTO-01 and the
Non-findings section for what was examined and left alone.

---

### AUTO-01: Extract tab-navigation wait primitives from engine.ts and dedupe the post-navigation sequence

**Priority:** P2     **Effort:** S     **Type:** decompose

**Current state**
`apps/extension/background/automations/engine.ts` is 1,027 lines. Most of it is
cohesive automation semantics, but ~130 lines at the bottom are generic
`tabs.onUpdated` event machinery with no automation knowledge:
`apps/extension/background/automations/engine.ts:918-955 (waitForTabComplete)`,
`apps/extension/background/automations/engine.ts:957-1012 (waitForNavigationAfterAction)`,
plus `apps/extension/background/automations/engine.ts:419-422 (NavigationWaitResult)`
and the constants `NAVIGATION_COMPLETE_TIMEOUT_MS` (line 97) and
`NO_NAVIGATION_GRACE_MS` (line 958). Separately, the post-same-tab-navigation
bookkeeping — refresh page context, then disable further host-permission
prompts — is repeated four times:
`apps/extension/background/automations/engine.ts:449-451 (runNavigatingContentSegment)`,
`apps/extension/background/automations/engine.ts:481-482 (runNavigatingContentSegment)`,
`apps/extension/background/automations/engine.ts:597-599 (runEngineStep, navigate case)`,
`apps/extension/background/automations/engine.ts:609-612 (runEngineStep, openUrl currentTab case)`.
The `navigate` and `openUrl currentTab` cases additionally duplicate the full
preflight → `tabs.update` → wait → refresh sequence
(`engine.ts:593-601` vs `engine.ts:607-612`).

**Why it matters**
The wait primitives are the only part of the engine that reasons about raw
browser events (settled flags, grace windows, listener cleanup) — a reader
tracing a run has to page through them to get back to automation semantics, and
they can only be tested today by driving a whole automation through
`engine.test.ts`. The four hand-copied post-navigation sequences are the kind
of invariant ("after any same-tab navigation, prompts are disabled and page
context refreshes") that silently breaks when a fifth navigation site is added
and one of the two lines is forgotten — that invariant is load-bearing for the
host-permission model described in `docs/automations.md` §"Same-tab navigation
from content actions".

**Proposed change**
1. New file `apps/extension/background/automations/tabNavigation.ts` with the
   moved-verbatim primitives:
   - `export const NAVIGATION_COMPLETE_TIMEOUT_MS = 15_000`
   - `export type NavigationWaitResult = { kind: "navigated" } | { kind: "noNavigation" } | { kind: "timeout" }`
   - `export const waitForTabComplete = (tabId: number): Promise<void>` (from engine.ts:923-955)
   - `export const waitForNavigationAfterAction = (tabId: number, timeoutMs: number): Promise<NavigationWaitResult>` (from engine.ts:960-1012, with `NO_NAVIGATION_GRACE_MS` module-local)
   - `export const readTabPageContext = (tabId: number): Promise<{ url?: string; title?: string } | null>` — the `tabs.get` read half of `refreshPageContext` (engine.ts:1014-1027); returns `null` when the read throws.
2. In engine.ts, keep a thin applier and two invariant helpers (all private):
   - `refreshPageContext(state)` — calls `readTabPageContext(state.tabId)` and applies the existing per-field fallback to previous values, mutating `state.pageContext`/`state.context` exactly as today.
   - `markNavigated(state)` — `await refreshPageContext(state); state.hostPermissionRequestsAllowed = false`. Replace the four repeats listed above.
   - `navigateCurrentTab(state, url)` — `ensureKnownNavigationHostAccess` → `tabs.update` → `waitForTabComplete` → `markNavigated`. Used by the `navigate` case and the `openUrl` `currentTab` branch.
3. Import the primitives back into engine.ts. No signature or behavior change
   anywhere.

**Do NOT change / risks**
Do not touch the `Promise.race` logic in
`engine.ts:430-498 (runNavigatingContentSegment)` — the lost-response tolerance
is inherently subtle, correct, well-commented, and pinned by three tests. Do
not move `ensureAutomationHostAccess`/`ensureKnownNavigationHostAccess` (they
need `RunState` and belong with run semantics). Do not extract `RunState`. Toast
text, error messages, and timeout values must stay byte-identical.

**Verification**
`engine.test.ts` "expectNavigation segments" and "engine ops and policy"
suites stay green unmodified. Optionally add direct unit tests for
`waitForNavigationAfterAction` (grace-window noNavigation, loading→complete,
timeout) in a new `tabNavigation.test.ts` — cheaper than the current
whole-engine harness. `pnpm run tsc && pnpm test`.

**Related**
AUTO-02 (touches the same host-access throw sites; land AUTO-01 first or
rebase), AUTO-08 (names the new direct tests). File 30 owns the workflow
executor these segments are delivered to.

---

### AUTO-02: Record step outcomes uniformly when engine ops fail on host access

**Priority:** P2     **Effort:** S     **Type:** consistency

**Current state**
`AutomationRunError` (`apps/extension/background/automations/engine.ts:121
(AutomationRunError)`) plays two roles: (a) "run-fatal failure whose outcome is
already recorded/attributed" — thrown by
`engine.ts:555-570 (recordEngineOutcome)` after pushing a failure row and by
`engine.ts:397-417 (runContentSegment)` after `recordSegmentResult` — and (b)
plain run-fatal errors that were never attributed to a step:
`engine.ts:364-377 (ensureAutomationHostAccess)` throws it directly for host-
permission denials. `runEngineStep`'s catch
(`engine.ts:686-695 (runEngineStep)`) rethrows any `AutomationRunError` without
recording, precisely so nested control-flow failures aren't re-attributed to
the outer branch/loop step. The side effect: an engine op that fails on host
access (`clipboardWrite`, `insertSnippet`, `navigate`, `openUrl currentTab`)
produces **no `stepOutcomes` row and no `executedSteps` increment**, while the
same op failing on any other error is recorded with `success: false` and an
error string.

**Why it matters**
`stepOutcomes` drives the options builder's "Test on Active Tab" per-step
display (`docs/automations.md` §"Options builder") — the one debugging tool for
non-programmers. A host-access failure shows a run-level error with no failing
step row, whereas every other failure points at the step. Code-wise, the dual
role of `AutomationRunError` is undocumented, so a maintainer adding a new
engine op cannot tell whether throwing it is safe or skips bookkeeping.

**Proposed change**
1. Add `class HostAccessError extends Error {}` next to `AutomationRunError`
   (or in `tabNavigation.ts`'s sibling if AUTO-01 lands first — engine.ts is
   fine).
2. Change both throw sites in `ensureAutomationHostAccess`
   (`engine.ts:370-373` grant-page path, `engine.ts:375-377` denial path) to
   throw `HostAccessError` with the identical messages.
   `ensureKnownNavigationHostAccess` inherits the change.
3. No change to `runEngineStep`'s catch: `HostAccessError` is no longer an
   `AutomationRunError`, so the existing non-sentinel path records the failing
   step's outcome (with the same message) and converts it via
   `recordEngineOutcome`. Content-segment paths (`runWorkflowSteps` →
   `executeRun` catch) keep today's behavior and messages — only the class
   changes in flight.
4. Add a doc comment on `AutomationRunError` stating the contract verbatim:
   `// Sentinel for run-fatal failures that are ALREADY attributed — either a
   step outcome was recorded (recordEngineOutcome/recordSegmentResult) or the
   failure belongs to the run, not the current step. runEngineStep's catch
   rethrows it without recording; throw a plain Error (or HostAccessError)
   when the current step should own the failure.`

**Do NOT change / risks**
Error message strings must stay byte-identical — `engine.test.ts` "host
access" suite asserts on them, and users may have learned them. Navigation
timeout throws in `runNavigatingContentSegment` (engine.ts:456, 487) stay
`AutomationRunError` (attributable to the trailing segment step is debatable,
but changing it would double-record when the workflow result already recorded).
Verify nothing else does `instanceof AutomationRunError` (today only
engine.ts:687).

**Verification**
Existing "host access" tests stay green (same messages, same run result). New
test: an automation whose only step is `clipboardWrite` on a denied host
returns `stepOutcomes` containing `{ op: "clipboardWrite", success: false }`
(today: outcomes array is empty). `pnpm test`.

**Related**
AUTO-01 (same lines; order them), AUTO-08. Builder display is file 22's scope —
no editor change needed, it renders whatever outcomes arrive.

---

### AUTO-03: Give the engine-op set a single source of truth

**Priority:** P2     **Effort:** S     **Type:** dedupe

**Current state**
The "which ops run in the background" set is enumerated three times in
parallel:
- the `AutomationEngineStep` union, `apps/extension/shared/types/automations.ts:266-278 (AutomationEngineStep)` — 12 ops;
- `apps/extension/background/automations/lowering.ts:18-31 (ENGINE_OPS)` — the same 12 op strings, hand-copied into a `Set` for `isEngineStep`;
- `apps/extension/shared/utils/automation-introspection.ts:74-86 (BACKGROUND_ONLY_OPS)` — 11 of the 12 (deliberately omitting `insertSnippet`, which touches the page), used by `automationTouchesPage` for the editor's host-permission preflight.

None of the three references the others; the only guard is
`lowering.test.ts` ("classifies engine vs content steps exhaustively").

**Why it matters**
Adding an engine op is the documented lockstep path (CLAUDE.md,
`docs/automations.md`). Today that means updating a type union and two
unconnected string sets in different layers; missing `ENGINE_OPS` makes the new
op lower as a "content step" and fail at workflow validation (loud but
baffling), and missing `BACKGROUND_ONLY_OPS` silently mis-answers "does this
automation touch the page", skipping the editor's host-permission preflight.
Type-level exhaustiveness makes both mistakes impossible.

**Proposed change**
1. In `apps/extension/shared/types/automations.ts`, next to the union:
   ```ts
   // Exhaustiveness-checked: adding an op to AutomationEngineStep without
   // listing it here is a type error, and vice versa.
   const ENGINE_OP_TABLE: Record<AutomationEngineStep["op"], true> = {
     setVariable: true, insertSnippet: true, toast: true, navigate: true,
     openUrl: true, clipboardWrite: true, runCommand: true, showSurface: true,
     hideSurface: true, branch: true, forEach: true, while: true,
   }
   export const AUTOMATION_ENGINE_OPS: ReadonlySet<string> =
     new Set(Object.keys(ENGINE_OP_TABLE))
   ```
2. `lowering.ts`: delete `ENGINE_OPS` (lines 18-31); `isEngineStep` reads
   `AUTOMATION_ENGINE_OPS`.
3. `automation-introspection.ts`: replace the `BACKGROUND_ONLY_OPS` literal
   with a derivation plus the reason it differs:
   ```ts
   // Engine ops except insertSnippet: it executes in the background but
   // types into the page, so automationTouchesPage must count it.
   const BACKGROUND_ONLY_OPS = new Set(
     [...AUTOMATION_ENGINE_OPS].filter((op) => op !== "insertSnippet"),
   )
   ```
   (shared → shared import; no layer boundary crossed. `lowering.ts` importing
   from `shared/types` is the existing direction.)

**Do NOT change / risks**
This is not a plugin registry and must not become one — a checked table with
two consumers, nothing more. `shared/types/automations.ts` already exports
runtime values (`automationCommandId`), so a `Set` there follows precedent. Do
not preempt any `chrome.userScripts` flavor decision (settings-page.md §10) —
a JS flavor would be a sibling document shape, not a new op here.

**Verification**
`lowering.test.ts` exhaustive-classification test stays green. Type check
proves the table: temporarily remove one key and confirm `pnpm run tsc` fails.

**Related**
AUTO-07 (same file pair), `docs/automations.md` §Steps table stays accurate
unchanged.

---

### AUTO-04: Finish the user-scripts → automations naming migration in code

**Priority:** P2     **Effort:** M     **Type:** consistency

**Current state**
`docs/automations.md:5` states "code and ids use the automations/`automation-`
naming", but the previous "user scripts" naming survives across the subsystem:
- `script` as the pervasive identifier: `apps/extension/background/automations/engine.ts:123-133 (RunState.script)` and ~30 occurrences per file in engine.ts, `alarms.ts` (29), `commands.ts` (46), `triggerEngine.ts` (19), plus comment prose in all ten modules;
- symbol names: `apps/extension/background/automations/alarms.ts:153-173 (runScheduledScript)`, `alarms.ts:194-201 (runStartupScripts)`, `apps/extension/background/automations/commands.ts:29-51 (scriptTypesIntoPage)`, `commands.ts:83-92 (runScriptFromPalette)`, `commands.ts:95-103 (scriptNodeBase)`, `commands.ts:111-176 (scriptToCommandNode)`, `commands.ts:24 (USER_SCRIPTS_OPTIONS_HASH)`;
- exported constants: `apps/extension/shared/types/automationValidation.ts:27-40 (USER_SCRIPT_MAX_COUNT … USER_SCRIPT_ELEMENT_APPEARS_MIN_THROTTLE_MS)`, consumed by engine.ts, storage.ts, commands.ts, validation.test.ts.

Adjacent trivia to sweep in the same pass: duplicate `"automation"` keyword in
`commands.ts:190 (automationsGroup.keywords)`; "Runs a automation" typo in
`engine.ts:136 (runAutomation docstring)`; `eligibility.ts:1-3` is the one
module missing the `// Architecture: background layer.` header prefix; and
`engine.ts:99-114 (AutomationInvocation)` hand-lists the five non-manual
trigger type strings where `Exclude<AutomationTriggerType, "manual">` states
the intent.

**Why it matters**
Grep is the primary navigation tool in this repo's conventions. An engineer
searching `automation` misses `runScheduledScript` and `USER_SCRIPT_MAX_STEPS`;
one searching the docs' vocabulary ("automation") against the code's
("script") has to learn the synonym pair per file. The docs explicitly claim a
naming rule the code contradicts.

**Proposed change**
Ordered, purely mechanical steps (no behavior change):
1. Within `apps/extension/background/automations/`: rename local identifiers
   and private symbols `script`→`automation` (params, locals, `RunState.script`
   → `RunState.automation`), `runScheduledScript`→`runScheduledAutomation`,
   `runStartupScripts`→`runStartupAutomations`,
   `scriptTypesIntoPage`→`automationTypesIntoPage`,
   `runScriptFromPalette`→`runAutomationFromPalette`,
   `scriptNodeBase`→`automationNodeBase`,
   `scriptToCommandNode`→`automationToCommandNode`,
   `USER_SCRIPTS_OPTIONS_HASH`→`AUTOMATIONS_OPTIONS_HASH`. Update comment prose
   ("script(s)"→"automation(s)") in these files and in
   `shared/types/automations.ts` comments.
2. Rename the exported constants in `automationValidation.ts`
   `USER_SCRIPT_*`→`AUTOMATION_*` and update the five consuming files
   (engine.ts, storage.ts, commands.ts — wait, commands.ts consumes none of
   these; actual consumers per grep: engine.ts, storage.ts,
   validation.test.ts, and automationValidation.ts itself). No aliases, no
   re-exports.
3. Fix the trivia listed above (duplicate keyword, typo, eligibility header,
   `AutomationInvocation` trigger type via `Exclude`).

**Do NOT change / risks**
**Never rename stored or wire identifiers**: the `monocle-automations` storage
key, the `automation-` command-id prefix (`automationCommandId`), the
`automation:` alarm-name and surface-owner prefixes, and all
`monocle-automation-*` message types stay exactly as-is. User-facing strings
("automation", "Automations") already say the right thing — don't touch copy.
The editor UI (file 22) imports none of the renamed constants per grep, but
re-verify before landing step 2.

**Verification**
`pnpm run tsc`, `pnpm run fmt:check`, `pnpm test`, `pnpm run build` — a pure
rename must produce zero test edits beyond identifier references.
`grep -rn "USER_SCRIPT\|Script\b" apps/extension/background/automations` returns
only justified hits (none expected).

**Related**
File 40 owns the matching doc touch-ups (`docs/automations.md:1` title
"# Automations (Automations)" is itself rename residue). AUTO-06/AUTO-07 touch
`commands.ts`/`storage.ts` — land in either order, trivial rebases.

---

### AUTO-05: Reuse `resolveSnippetValue` for the `insertSnippet` engine op

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
Two implementations of "resolve a snippet body at run time, bumping the
persisted `{i}` counter only when used":
`apps/extension/background/automations/interpolate.ts:118-137
(resolveSnippetValue)` (module-private; feeds var/inline-ref resolution) and
`apps/extension/background/automations/engine.ts:704-717 (runInsertSnippet)`,
which re-rolls the same `getSnippet` → `snippetBodyUsesCounter` →
`incrementSnippetCounter` → `interpolateSnippetBody` sequence inline. They
differ only in not-found message text (`Snippet not found for <reference>` vs
`Snippet not found: <id>`).

**Why it matters**
The counter-bump rule ("only when the body uses `{i}`, same sequence as palette
insertion") is a documented semantic (`docs/automations.md` §Variables and
interpolation, item 2). Duplicating it means a future change — e.g. a new
placeholder that also consumes the counter — must be found twice, and the two
paths can drift apart silently since only the interpolate.ts copy has focused
tests.

**Proposed change**
1. Export `resolveSnippetValue` from `interpolate.ts` (same signature:
   `(snippetId, pageContext, reference) => Promise<string>`).
2. In `runInsertSnippet`, replace engine.ts:704-717 with
   `const text = await resolveSnippetValue(snippetId, state.pageContext, \`snippet ${snippetId}\`)`
   — the fill/`monocle-text-insert`/clipboard-fallback logic below it stays.
3. Accept the message change `Snippet not found: <id>` →
   `Snippet not found for snippet <id>` (or thread the exact old string through
   the `reference` param if byte-identity is preferred; state the choice in the
   commit).

**Do NOT change / risks**
Counter semantics must stay identical (conditional bump, shared sequence). Do
not merge `runInsertSnippet`'s insertion mechanics into interpolate.ts —
interpolation must stay ignorant of tabs and messaging.

**Verification**
`interpolate.test.ts` green; add one `engine.test.ts` case asserting
`insertSnippet` with a `{i}` body bumps the counter once (also listed in
AUTO-08). Manual: palette Insert Snippet and an automation `insertSnippet`
draw from one counter sequence.

**Related**
AUTO-08. Snippets module ownership: `background/commands/snippets.ts` is file
10's scope — no change there.

---

### AUTO-06: Remove the dead `getAutomation` export and the dead `interpolatableStrings` re-export

**Priority:** P3     **Effort:** S     **Type:** dead-code

**Current state**
- `apps/extension/background/automations/storage.ts:61-67 (getAutomation)` — by-id lookup over stored docs only — has zero callers (repo-wide grep: only the definition). Its live near-twin is `apps/extension/background/automations/registry.ts:27-33 (getAutomationById)`, which also resolves feature-projected documents.
- `apps/extension/background/automations/interpolate.ts:22 (export { interpolatableStrings })` re-exports the shared util for no consumer — the one user (`options/pages/automations/editorState.ts:22`) imports it from `shared/utils/automation-introspection` directly.

**Why it matters**
`getAutomation` is worse than dead: it is a loaded trap. Any future engine-path
caller that reaches for the storage version instead of the registry version
silently breaks feature-projected automations (they are never stored). The
re-export similarly suggests interpolate.ts is the API surface for
introspection when it is not.

**Proposed change**
Delete both: storage.ts lines 61-67 (and its doc comment) and interpolate.ts
line 22 plus the now-unused `interpolatableStrings` import specifier at
`interpolate.ts:13`.

**Do NOT change / risks**
Keep `storage.getAutomations` (plural — used by commands.ts, registry.ts).
Keep `registry.getAutomationById` as the only by-id lookup; its architecture
comment already explains why.

**Verification**
`pnpm run tsc` (dead-import removal), `pnpm test`. Grep confirms no references
remain.

**Related**
AUTO-04 (touches the same files; either order).

---

### AUTO-07: Replace the hand-rolled step walk in `commands.ts` with the shared `walkAutomationSteps`

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
`apps/extension/background/automations/commands.ts:29-51 (scriptTypesIntoPage)`
implements its own recursion over `branch.then/else` and `forEach/while.steps`
to detect page-typing steps. The repo already has exactly this visitor:
`apps/extension/shared/utils/automation-introspection.ts:57-72
(walkAutomationSteps)`, used by `automationTouchesPage` and
`collectInlineSnippetReferences` in the same file.

**Why it matters**
Adding a fourth control-flow op (or a new child-array key) would require
finding every private walker; the shared visitor is the single place that
recursion is supposed to live. This one is a genuine reuse of an existing
multi-consumer abstraction, not a new one.

**Proposed change**
Rewrite the predicate on the shared visitor:
```ts
const scriptTypesIntoPage = (script: Automation): boolean => {
  let writes = false
  walkAutomationSteps(script.steps, (step) => {
    if (step.op === "fill" || step.op === "type" || step.op === "insertSnippet") {
      writes = true
    }
  })
  return writes
}
```
Keep the explanatory comment about `requireNonShiftModifier` (commands.ts:27-28)
verbatim.

**Do NOT change / risks**
`engine.ts:781-798 (mapStepsDeep)` is *not* a candidate — it transforms
(returns new trees) rather than visits; leave it. Likewise
`automationValidation.ts:483-524 (collectStructuralIssues.walk)` needs
path/depth tracking the visitor doesn't carry; leave it (recorded as a
non-finding).

**Verification**
`commands.test.ts` green; behavior identical for nested `fill` inside
`branch.else` (add the case if missing).

**Related**
AUTO-03 (same shared file), AUTO-04 (renames this symbol).

---

### AUTO-08: Cover untested engine ops, runtime limits, and the content trigger service

**Priority:** P2     **Effort:** M     **Type:** test-gap

**Current state**
Coverage is strong where it exists (`engine.test.ts` 791 lines: segmentation,
interpolation, host access, expectNavigation races, forEach-over-elements,
cooldowns, runCommand policy; focused suites for lowering, conditions,
interpolate, alarms, triggerEngine, storage, registry, validation, policy).
Gaps, verified against the test lists:
- `engine.ts:881-901 (runWhile)` — no test executes a `while` step.
- `engine.ts:830-843 (runForEach, variable branch)` — forEach over a variable's lines untested.
- `engine.ts:698-748 (runInsertSnippet)` — neither the targeted-fill path nor the focus/clipboard fallback is tested.
- `engine.ts:638-660 (runEngineStep, showSurface/hideSurface cases)` — untested (owner stamping `automation:<id>`, interpolated title/text).
- `engine.ts:323-330 (countExecutedStep)` — the 5,000-step runtime cap never trips in tests; `engine.ts:160-165 (runAutomation structural re-check)` failure path likewise.
- `engine.ts:179-183 (runAutomation, runningRuns re-entrancy)` — concurrency drop untested (cooldown is tested; concurrency is not).
- `alarms.ts:194-201 (runStartupScripts)` — onStartup execution path untested (only "creates no alarm for onStartup" is).
- `apps/extension/content/automationTriggers.ts` — **zero tests** for the whole arming service: `fireUrlTriggers` oncePerPage/per-href semantics (`automationTriggers.ts:117-148`), `checkElementTriggers` throttle + once-fired short-circuit (`automationTriggers.ts:178-213`), re-arm on SPA refresh.

**Why it matters**
These are the privileged and abuse-limit paths — exactly what the "defense in
depth" comments claim. An engine refactor (AUTO-01/02) currently cannot prove
it preserved `while` semantics, loop-scope restoration on failure, or the
runaway cap, and the content trigger service's throttle/once logic is the only
line between a mutation-heavy page and a trigger storm.

**Proposed change**
Extend existing files (repo pattern: co-located `.test.ts`):
1. `engine.test.ts`: "while re-evaluates its condition per iteration and stops
   at the cap"; "forEach over a variable iterates non-empty lines and scopes
   {{item}}/{{index}}"; "insertSnippet without target falls back to clipboard
   and toasts when nothing is focused"; "showSurface/hideSurface upsert/remove
   under owner automation:<id> with interpolated content"; "run fails when the
   runtime executed-step cap is exceeded" (a 1,000-iteration forEach over a
   variable with 6 body steps trips 5,000); "a second run of the same
   automation on the same tab is dropped while the first is in flight" (hang
   the workflow stub); "a stored document failing structural re-check refuses
   to run".
2. `alarms.test.ts`: "onStartup automations run against an eligible tab on
   runtime.onStartup" (drive the registered listener, assert `runAutomation`
   invocation shape).
3. New `apps/extension/content/automationTriggers.test.ts` (same DOM test
   environment as `content/siteSdkBridge.test.ts`): urlMatch oncePerPage is
   per-href for SPA fires and per-document for load; elementAppears respects
   the throttle floor and never re-fires after `oncePerPage`; a SPA navigation
   re-pulls specs and re-arms.

**Do NOT change / risks**
Tests must pin current behavior, not improve it — write them before AUTO-01/02
land, or immediately after with the specs' "byte-identical" guarantees as the
oracle. Don't add a test-only export surface; everything above is reachable
through `runAutomation`, the alarm listener, and `initializeAutomationTriggers`.

**Verification**
`pnpm test` count increases; mutation-style spot check: break `loopCap` default
and confirm a new test fails.

**Related**
AUTO-01, AUTO-02, AUTO-05. File 41 should absorb this list into its risk
ranking.

---

## Non-findings (reviewed, justified)

- **`AutomationCommandBridge` dependency injection** (`apps/extension/background/automations/engine.ts:70-85 (registerAutomationCommandBridge)`, wired at `apps/extension/background/index.ts:49-67`) — exists solely to keep the automations ↔ commands import graph acyclic; two methods, one wiring site, documented in three places. Exactly right as-is (seeded hypothesis 2 confirmed).
- **No limits/permission duplication across engine, policy, and eligibility** (seeded hypothesis 3 refuted) — `engine.ts:91-97` (cooldown/concurrency/step caps), `runCommandPolicy.ts:91-137 (checkRunCommandPolicy)` (command reach), and `eligibility.ts:17-48 (getAutomationEligibility)` (URL scope) are three distinct layers; the trigger engine and alarms deliberately share the eligibility helper, so there is one URL-rule interpretation, not two.
- **Trigger architecture boundary is clear** (seeded hypothesis 4 confirmed clean) — three entry points (`commands.ts` manual, `triggerEngine.ts:90-141 (handleTriggerFired)` page, `alarms.ts:153-173 (runScheduledScript)` scheduled) all converge on `runAutomation` with a typed `AutomationInvocation`, each re-validating its own inputs. One obvious path per trigger kind.
- **`interpolate.ts`/`conditions.ts` are self-contained** (seeded hypothesis 5 largely confirmed) — the only leak is the snippet-resolution copy fixed by AUTO-05; the engine's per-step `interpolate` closure (`engine.ts:580-581`) is a call, not logic.
- **`runNavigatingContentSegment` race complexity** (`engine.ts:430-498`) — irreducible: it exists to tolerate a response lost to navigation teardown without hiding real failures. Well-commented, pinned by three tests. Do not rewrite for style.
- **`runEngineStep`'s flat 12-case switch** (`engine.ts:584-683`) — big-but-linear with consistent branches; explicitly fine per the guard list.
- **Loop evaluation staying inside engine.ts** (`engine.ts:775-901`) — `runForEach`/`runWhile` recurse into `runStepList`, which dispatches back into `runEngineStep`; extraction would require callback-injecting the run loop into a loops module, pure indirection with one consumer (banned). This is the honest scope-down of seeded hypothesis 1: the engine is cohesive apart from the tab-event primitives (AUTO-01).
- **Run-time structural re-check duplicating the Zod schema** (`engine.ts:158-165` re-running `collectStructuralIssues`) — deliberate defense in depth against storage tampering, stated in the file header and `docs/automations.md`; not a dedupe target.
- **`registry.ts` as a 33-line union module** — the read-only user-docs + feature-projections seam is load-bearing (see the AUTO-06 trap); small on purpose.
- **`collectStructuralIssues`' private walker** (`automationValidation.ts:483-524`) — needs path and depth accumulation that `walkAutomationSteps` doesn't carry; a parameterized visitor for two shapes would be speculative abstraction.
- **`getPageTriggersForUrl` re-checking `isPageTrigger` inside the loop** (`triggerEngine.ts:59-63`) — a TypeScript narrowing artifact (the `filter` predicate combines two conditions so doesn't narrow); harmless, self-evident.
- **Schedule-trigger DST drift** (`alarms.ts:46-56 (nextOccurrenceOf)` + fixed `periodInMinutes: 24*60`) — a daily alarm drifts by one hour across a DST boundary until the next `syncAutomationAlarms` (startup/store change) recomputes `when`. Bounded, rare, and fixing it needs re-arm-on-fire machinery disproportionate to the harm. Accepted; worth one code comment at most.
- **`armedTrigger`'s `disarmed` cast** (`alarms.ts:58-66`) — the cast exists because `ManualTrigger` has no `disarmed` field; a discriminated helper type would cost more than the cast. Fine.
- **Future `chrome.userScripts` JS flavor** (settings-page.md §10, seeded hypothesis 6) — nothing in the engine fights it: a JS flavor would be a sibling document capability outside the step vocabulary, and the strict schemas would reject it until explicitly added (the intended posture). Nothing here designs for it, per the guard list.
- **Cooldown timestamp set before the run** (`engine.ts:185-191`) — a failed non-manual run still consumes the 5s cooldown; defensive and intended (retry storms are the threat model).

## Doc discrepancies noted (for file 40)

- `docs/automations.md:1` — title reads "# Automations (Automations)"; rename residue (was presumably "(User Scripts)").
- `docs/automations.md:5` — "code and ids use the automations/`automation-` naming" is aspirational until AUTO-04 lands; ids yes, code no.
- Otherwise `docs/automations.md`, `docs/automation_context.md`, and the engine-relevant parts of `docs/workflow-automation.md` were verified accurate against the code (caps table, trigger accessors, runCommand policy, alarm semantics, lowering corollary).
