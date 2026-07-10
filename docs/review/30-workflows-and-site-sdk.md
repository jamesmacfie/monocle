# 30 — Workflows and Site SDK (executor, external-command providers)

Scope: the DOM workflow executor (`apps/extension/content/workflow/*` +
`apps/extension/background/workflows/execution.ts` +
`apps/extension/background/messages/executeWorkflow.ts`), the workflow contract
(`apps/extension/shared/types/workflow.ts` /
`apps/extension/shared/types/workflowValidation.ts`), the site SDK
(`apps/extension/content/siteSdkFacade.ts`,
`apps/extension/content/siteSdkBridge.ts`,
`apps/extension/background/commands/siteSdk/*`,
`apps/extension/entrypoints/site-sdk.content.ts`,
`apps/extension/shared/types/siteSdk.ts`), the shared external-command engine
(`apps/extension/background/commands/externalProvider/*`), and the peer-extension
provider (`apps/extension/background/commands/extensionSdk/*`). The automations
engine/lowering side is file 11 (`AUTO-*`); this file references it, never
duplicates it.

**Overall assessment: this is one of the best-factored corners of the codebase.**
The workflow lockstep invariant holds op-for-op; the site SDK and peer-extension
SDK were correctly deduplicated onto one shared engine (`externalProvider/`)
parameterised by a five-member adapter; and there is a single content-op
vocabulary that automations reuse by type composition rather than a parallel
copy. Every seeded hypothesis except one (hypothesis 5, whose premise conflates
two unrelated files) is either confirmed clean or resolves to a prominent
Non-finding. The findings below are small: two P3 dedupes of helpers the shared
engine was meant to own, and one P2 test gap. The bulk of the value in this pass
is the Non-findings section (it stops future reviewers re-litigating a clean
design) and the doc/security-note corrections.

---

### WF-01: Move the duplicated `validateCallbackCommands` helper into the shared external provider

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
The re-validation of untrusted callback-returned command lists is implemented
twice, byte-for-byte, one per adapter:
`apps/extension/background/commands/siteSdk/commands.ts:43-53 (validateCallbackCommands)`
and
`apps/extension/background/commands/extensionSdk/transport.ts:35-43 (validateCallbackCommands)`.
Both call `validateExternalCommandList(commands, { allowPlacement: false })` and
throw `new Error(validation.error)` on failure. The whole point of
`apps/extension/background/commands/externalProvider/` is to be the one place the
provider engine lives, and `docs/extension-extension/provider-refactor.md:108-109`
explicitly states "The returned-command re-validation (`validateCallbackCommands`
→ `validateExternalCommandList`) is shared" — but as built it is not shared, it
is copied into each adapter.

**Why it matters**
This is the untrusted-page/untrusted-peer output boundary — the exact place the
security model (`docs/site-sdk-security.md` "Validation boundary") says every
callback result is re-validated. Two hand-copied validation gates on a
security-relevant path can drift: a future tightening (a new cap, a stricter
`allowPlacement` rule, a logging requirement) landed in one adapter and forgotten
in the other would silently weaken one provider's boundary while tests on the
other stay green. The doc already promises this is shared, so code and doc
disagree today.

**Proposed change**
1. Add to `apps/extension/background/commands/externalProvider/index.ts` (and
   re-export from the barrel):
   ```ts
   // Re-validate untrusted callback output before the engine converts it.
   // allowPlacement:false — callback-returned commands are already nested.
   export const validateCallbackCommands = (
     commands: unknown,
   ): ExternalCommand[] => {
     const validation = validateExternalCommandList(commands, {
       allowPlacement: false,
     })
     if (!validation.success) {
       throw new Error(validation.error)
     }
     return validation.commands
   }
   ```
2. Delete the two local copies (`siteSdk/commands.ts:43-53`,
   `extensionSdk/transport.ts:35-43`) and import the shared one. `invokeSiteSdk`
   and `invokeExtension` keep their existing call sites unchanged.

**Do NOT change / risks**
Keep the content-side bridge validation
(`content/siteSdkBridge.ts:174-190`, using `validateSiteSdkCommandList` directly)
exactly as-is — that is the deliberate first of the two "double-validated"
checks (`docs/site-sdk-security.md` invariants), runs in a different world, and
must not be collapsed into the background copy. Error message text
(`validation.error`) must stay identical. Do not change `allowPlacement: false`.

**Verification**
`externalProvider.test.ts`, `siteSdk.test.ts`, and
`background/features/extensionRegistry/extensionRegistry.test.ts` stay green.
`pnpm run tsc && pnpm test`. Grep confirms only one `validateCallbackCommands`
definition remains.

**Related**
Aligns code with `docs/extension-extension/provider-refactor.md:108-109`. Touches
the same adapters as the extension-extension future work (file 42 / `FUT`).

---

### WF-02: Consolidate the `missingElementResult` / "Could not find element" helper into `dom.ts`

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
The "element not found" step result is produced from the same template in five
places across three op modules: a private `missingElementResult` helper in
`apps/extension/content/workflow/interactionOps.ts:22-25 (missingElementResult)`
and in `apps/extension/content/workflow/formOps.ts:31-34 (missingElementResult)`,
plus three inline copies in
`apps/extension/content/workflow/domOps.ts:38-42 (executeGetText)`,
`apps/extension/content/workflow/domOps.ts:65-69 (executeRemoveElement)`, and
`apps/extension/content/workflow/domOps.ts:88-92 (executeHideElement)`. All five
emit `Could not find element for selector: ${JSON.stringify(target)}`.

**Why it matters**
`content/workflow/dom.ts` already exists as the shared-primitives module ("so
element semantics stay identical across every operation" — its header). The
not-found result is exactly such a shared semantic, yet it is duplicated two
ways (a helper twice, inline three times). A change to the error shape — e.g.
including the step `op` for the "Test on Active Tab" per-step display, or
redacting selectors that may embed user text — must currently be found in five
spots. Low blast radius (leaf files), hence P3, but it is genuine drift-prone
duplication of a helper the module boundary was designed to hold.

**Proposed change**
1. Export from `apps/extension/content/workflow/dom.ts`:
   ```ts
   export const missingElementResult = (target: unknown): StepResult => ({
     success: false,
     error: `Could not find element for selector: ${JSON.stringify(target)}`,
   })
   ```
   (import `StepResult` from `../../shared/types/workflow`).
2. Delete the two private helpers and import the shared one in `interactionOps.ts`
   and `formOps.ts`; replace the three inline `domOps.ts` objects with
   `missingElementResult(step.from)` / `missingElementResult(step.target)`.

**Do NOT change / risks**
Message text must stay byte-identical (`content/workflow/ops.test.ts` /
`executor.test.ts` assert on `"Could not find element for selector"` and other
error substrings). Do not fold in the differently-worded results
(`"Element is not visible"`, `"not an input, textarea, or editable element"`,
`"No option matched …"`) — those are distinct failure reasons and belong where
they are.

**Verification**
`content/workflow/ops.test.ts` and `content/workflow/executor.test.ts` stay green
unmodified. `pnpm run tsc && pnpm test`.

**Related**
Independent of WF-01/WF-03.

---

### WF-03: Cover the workflow executor's retry/backoff policy and the peer-extension invoke transport

**Priority:** P2     **Effort:** M     **Type:** test-gap

**Current state**
Coverage of the *ops* is excellent — every one of the 17 workflow ops has a
behavior test (see the hypothesis-1 Non-finding below). Two load-bearing,
untested seams remain:
- **Retry/backoff policy.** `content/workflow/executor.ts:109-128
  (executeStepWithPolicy)` and `content/workflow/executor.ts:157-169
  (getRetryDelay)` implement `(retries ?? 0) + 1` attempts with linear or
  `2 ** n` exponential backoff. Grep confirms **no test sets `retry`** in either
  `executor.test.ts` or `ops.test.ts` — the retry loop and the exponential-delay
  arithmetic have zero coverage. (Timeout via `executeStepWithTimeout` is
  indirectly exercised by the wait/click-delay tests; retry is not.)
- **Peer-extension invoke transport.** `background/commands/extensionSdk/`
  has **no `.test.ts`** (confirmed by directory listing). `invokeExtension`
  (`apps/extension/background/commands/extensionSdk/transport.ts:45-112`) owns
  the port lifecycle: `connect` failure, the 3s timeout, `onDisconnect`, the
  `settled`/`finish` guard, and callback re-validation. The shared engine is
  tested via a fake adapter (`externalProvider.test.ts`) and the site transport
  via `siteSdk.test.ts`, but the peer transport — a privileged cross-extension
  RPC — is only reached (if at all) through the feature module's
  `extensionRegistry.test.ts`, not unit-tested at the transport boundary.

**Why it matters**
Retry/backoff is executor-core: every automation content segment and every
workflow runs through `executeStepWithPolicy`, and the exponential-delay math is
the kind of off-by-one (`2 ** attempt` vs `2 ** (attempt-1)`) that ships silently
and is only noticed as "retries hammer too fast/slow." The peer invoke transport
is the one place Monocle opens a port into another extension and trusts a
timeout + disconnect handler to fail closed; a regression there is a
hung-palette or a leaked port with no test to catch it.

**Proposed change**
Extend existing files (repo pattern: co-located `.test.ts`); add no test-only
export surface.
1. `content/workflow/executor.test.ts`: "a step with `retry: { retries: 2 }`
   retries until success and reports success"; "retries exhaust and return the
   last failure"; "`backoff: 'exponential'` doubles the delay per attempt"
   (drive with `vi.useFakeTimers()` and a stubbed op that fails N times — a
   failing `click` on a missing selector plus a retry is the cheapest fixture).
2. New `background/commands/extensionSdk/transport.test.ts` with a fake
   `runtime.connect` returning a scriptable `ExtPort`: "resolves on `ok` reply
   and re-validates commands"; "rejects on `ok:false`"; "rejects and disconnects
   on timeout"; "rejects on `onDisconnect`"; "a late second reply after settle is
   ignored"; "connect throwing rejects with the thrown error".

**Do NOT change / risks**
Tests pin current behavior, not improve it — the `INVOKE_TIMEOUT_MS = 3000`
budget and the linear-default/`delayMs ?? 0` semantics are the oracle. Do not add
a real cross-extension dependency; the port must be a stub. `extensionRegistry`
feature internals (registry warm/persist) are file 13's scope — test only the
transport here.

**Verification**
`pnpm test` count rises; mutation spot-check: change `2 ** completedAttemptIndex`
to `2 ** (completedAttemptIndex + 1)` and confirm the new backoff test fails;
break the `settled` guard and confirm the "late reply ignored" test fails.

**Related**
File 41 (`TEST`) should absorb this into its risk ranking. Peer transport tests
also de-risk the extension-extension future work (file 42 / `FUT`). Parallel to
`AUTO-08` (which covers the automations-engine and content-trigger gaps).

---

## Non-findings (reviewed, justified)

- **Workflow lockstep invariant holds op-for-op (seeded hypothesis 1 — CONFIRMED,
  prominent).** All 17 members of the `Step` union
  (`apps/extension/shared/types/workflow.ts:61-79 (Step)`) have (a) a strict Zod
  schema in the `WorkflowStepSchema` discriminated union
  (`apps/extension/shared/types/workflowValidation.ts:223-241
  (WorkflowStepSchema)`), (b) an executor case in
  `apps/extension/content/workflow/executor.ts:173-208 (WorkflowExecutor.executeStep)`
  (`check`/`uncheck` share `executeSetChecked`), and (c) a behavior test in
  `content/workflow/ops.test.ts` (fill/select/check/uncheck/submit/getText/
  removeElement/hideElement/injectCss/hover/focus/blur/type/key/scroll) or
  `content/workflow/executor.test.ts` (click, wait). No op is missing a leg. The
  content-op vocabulary is deliberately content-executable only; privileged ops
  are automation-engine ops, documented in the file header
  (`workflow.ts:1-8`).
- **Unsupported ops fail loudly (seeded hypothesis 6 — CONFIRMED).** The switch
  default at `apps/extension/content/workflow/executor.ts:209-213
  (WorkflowExecutor.executeStep)` returns
  `{ success: false, error: "Unsupported step operation: <op>" }`, pinned by
  `content/workflow/executor.test.ts:318-337` (a hand-crafted `navigate` step).
  The schema boundary makes this unreachable for validated public workflows; it
  is the defense-in-depth backstop for direct background callers.
- **One content-op vocabulary, not two drifting ones (seeded hypothesis 2 —
  REFUTED, clean).** Automations do not maintain a parallel DOM-op set:
  `apps/extension/shared/types/automations.ts:162-165 (AutomationContentStep)` is
  literally `Exclude<WorkflowStep, ClickStep | SubmitStep> | AutomationClickStep |
  AutomationSubmitStep`, and the only additions are the `expectNavigation?` hint
  on click/submit (`automations.ts:160-161`), stripped before validation in
  `automations/lowering.ts` (file 11 / `AUTO-03`). Adding a workflow op flows into
  the automation vocabulary automatically at the type level — divergent semantics
  are impossible by construction. The privileged-vs-content separation is real
  and deliberate (CLAUDE.md), not drift.
- **Site SDK facade → wire → background is a clean facade boundary (seeded
  hypothesis 3 — CONFIRMED clean).** The page-world facade
  (`content/siteSdkFacade.ts`) holds callback *functions* and posts only a
  function-free, source-tagged (`monocle-site-sdk`) snapshot; the isolated bridge
  (`content/siteSdkBridge.ts`) validates before the background ever sees it, and
  the background command wrapper's `execute` only round-trips back to the page
  (`background/commands/externalProvider/convert.ts:60-185 (convertCommand)` calls
  `adapter.invoke`, never a privileged API). No privileged leak path exists; this
  matches `docs/site-sdk-security.md` "Why the SDK is contained." The Tier-2
  choke points are catalogued in the "Site-SDK Tier-2 readiness" note below.
- **The shared external-command provider dedup actually happened (seeded
  hypothesis 4 — CONFIRMED, no residual duplication except WF-01).** Both
  providers are thin adapters over one engine:
  `background/commands/siteSdk/commands.ts:80-104 (siteAdapter)` and
  `background/commands/extensionSdk/adapter.ts:16-35 (extensionAdapter)` both feed
  `background/commands/externalProvider/index.ts:63-92 (createExternalRootCommands)`.
  The per-node-type conversion, id encoding, and generated owner-group live once
  in `externalProvider/`. The five-member adapter (`externalProvider/types.ts:33-56
  (ExternalProviderAdapter)`) maps 1:1 to the only real differences (prefix, scope
  token, transport, fallback context, root partition). The only genuine residual
  duplication is the callback re-validation helper (WF-01).
- **`commands/extensions/index.ts` is NOT a mixed registry/messaging/validation
  module (seeded hypothesis 5 — premise REFUTED).** The hypothesis conflates two
  unrelated files. `apps/extension/background/commands/extensions/index.ts:1-311`
  is the Extensity-style **extension manager** — a big-but-linear command-tree
  builder over `chrome.management` (`extensionsGroup` at lines 262-309, with
  per-extension action builders). It contains no registry, no messaging, and no
  validation; it is exactly the "flat builder with consistent branches" the guard
  list permits as fine-as-is. The peer-extension **registry** is the separate
  `background/commands/extensionSdk/` (adapter/registry/transport), already split
  into four focused files. No split is warranted for either — splitting the
  manager would fragment one linear catalog for no reader benefit.
- **The facade's parallel `Monocle*` command types are the inherent
  function-carrying twin of the wire schema, not avoidable duplication.**
  `content/siteSdkFacade.ts:28-80 (Monocle*Command)` carry `onExecute`/`children`
  *functions*; the wire types (`shared/types/siteSdk.ts`) carry serialized
  `{ callbackId }` refs. They cannot share one type across the page/wire boundary,
  and `serializeCommand` (`siteSdkFacade.ts:179-277`) is the required
  function→ref conversion. TypeScript catches any omitted *required* wire field
  (the function returns `SiteSdkCommand`). A new *optional* wire field degrades
  gracefully (silently unsupported until the facade adds it) — a bounded, soft
  drift accepted as inherent to a MAIN-world SDK. Not a restructuring target.
- **The shared external schema still living in `siteSdk.ts` under `SiteSdk*`
  names (re-exported as `External*` via `shared/types/externalCommands.ts`) is a
  documented, deliberate deferral — leave it.** `externalCommands.ts:14-25` is a
  pure re-export shim, and `docs/extension-extension/provider-refactor.md:1-12`
  explains the physical move was skipped because it "added risk to the site SDK's
  public surface for no dedup benefit." The shim's header comment makes the
  shared nature discoverable. A physical rename is one-way churn on a shipped
  public surface with zero dedup gain — recommending it would re-litigate a
  reasoned decision and touches the guard list's "no rewrites of working, tested
  subsystems for style." (Contrast `AUTO-04`, a *code-identifier* rename that
  aids grep; this one is a *file location* move behind a clean alias.)
- **Callback commands validated twice (bridge + background) is intentional
  defense-in-depth.** `content/siteSdkBridge.ts:174-190` validates page callback
  output before it crosses to the background, and the background re-validates
  (WF-01's helper). Listed as an invariant in `docs/site-sdk-security.md`
  ("Function-free, double-validated declarations"). Not a dedupe target.
- **`resolveWorkflowTargetTabId`'s four-way tab resolution is a flat, documented
  priority chain, not tangled logic.** `background/workflows/execution.ts:136-174
  (resolveWorkflowTargetTabId)` (explicit tabId → sender tab → context-URL match →
  active tab) matches `docs/workflow-automation.md:44-50` exactly and each branch
  throws a distinct, tested error. The `deps` injection is for testability, one
  wiring pattern already used across background. Fine as-is.
- **`WorkflowExecutor`'s flat 17-case dispatch switch** — big-but-linear with
  consistent `return await executeX(step)` branches; explicitly fine per the
  guard list. The four op modules (interaction/form/dom/wait) are a clean split by
  concern, each building on `dom.ts` primitives.
- **The origin-hash id token is not a security boundary** — `scope.ts:71-80
  (hashSiteSdkOrigin)` is deterministic FNV for readable ids; the sender-derived
  scope is the authority (`scope.ts:32-63 (createSiteSdkScopeFromSender)`, which
  rejects subframes at `frameId !== 0`). Documented in `docs/site-sdk.md` and the
  security doc. Correct as-is.
- **The 1000-msg/min/sender rate limiter referenced by `docs/site-sdk-security.md`
  §1.5 does exist** — `background/utils/validation.ts:38 (RATE_LIMIT_MAX = 1000)`,
  applied at the message-dispatch layer (file 12 scope). No discrepancy; the sync
  spam vector is capped as the doc claims.

## Site-SDK Tier-2 hardening: choke-point readiness (pre-work note, not a change)

Per the task, this locates where the documented Tier-2 controls
(`docs/site-sdk-security.md` §2 and "Recommended priorities" #5–6) would attach,
and confirms no pre-work refactor is needed first. It designs nothing.

- **Document/frame-targeted page messaging (2.4, 2.6).** Two single choke points,
  both clean: `background/commands/siteSdk/commands.ts:57-64 (invokeSiteSdk)`
  (`sendTabMessage(scope.tabId, …)`) and
  `background/workflows/execution.ts:205-213 (executeWorkflowOnTargetTab)`. Each is
  the sole delivery site; the scope object already carries `documentId`/`frameId`
  (`scope.ts:4-12`), so the control attaches without restructuring.
- **Clamp `searchCommands.limit` (2.3)** and **derive URL-filter/workflow `tabId`
  from `sender` (2.1, 2.5).** Choke points are in the message layer
  (`background/messages/searchCommands.ts`, `resolveWorkflowTargetTabId`) — file
  12's scope; single sites, ready to harden.
- **Content-side workflow `sender.id` check (2.7).** Attaches at
  `shared/hooks/useCommandPaletteStateRedux.tsx:73` (the currently-unused
  `_sender`) — file 21's scope. Note the schema half of 2.7 is already done (see
  doc discrepancy below).
- No Tier-2 control requires touching the shared engine or the executor first —
  all attach at existing single-function boundaries. The `externalProvider`
  dedup (hypothesis 4) means a control added to callback re-validation would land
  once (via WF-01) for both providers.

## Doc discrepancies noted (for file 40)

- **`docs/site-sdk-security.md:233` (Tier-2 item 2.7) is partly stale.** It claims
  the content-side workflow listener "validates nothing … `message.workflow` cast
  without re-validation." In fact the listener re-validates the full workflow:
  `shared/hooks/useCommandPaletteStateRedux.tsx:76` calls `validateContentMessage`,
  and `shared/types/contentMessageValidation.ts:126-132
  (ExecuteWorkflowContentMessageSchema)` embeds `workflow: WorkflowSchema` (the
  complete deep schema), returning `null` on malformed input. The accurate residual
  is narrower: only the **`sender.id` check** is missing (the `_sender` param at
  `useCommandPaletteStateRedux.tsx:73` is unused). Recommendation #6's "add …
  schema re-validation" should be dropped; "add a content-side `sender.id` check"
  stands. `docs/workflow-automation.md:56` already states the schema validation
  correctly — the two docs contradict each other on this point.
- Otherwise `docs/workflow-automation.md` (17-op table, lockstep, executor module
  split, target-tab resolution, retry/timeout) and `docs/site-sdk.md`
  (schema/limits/data flows/internal ids) were verified accurate against the code,
  as was `docs/extension-extension/provider-refactor.md` (engine extracted, schema
  intentionally not moved).

## Test gaps noticed (summary; full spec in WF-03, cross-ref file 41)

- Workflow executor **retry/backoff policy** — zero coverage (WF-03).
- **`extensionSdk` transport** (`invokeExtension` port lifecycle/timeout/
  disconnect/re-validation) — no `.test.ts` in the directory (WF-03).
- The **`blur`** test (`content/workflow/ops.test.ts:374-397`) sets up focus/blur
  listeners but asserts only `result.success`, never that `blur` fired — a weak
  assertion, worth tightening when WF-03's file is touched (minor; not its own
  finding).
</content>
</invoke>
