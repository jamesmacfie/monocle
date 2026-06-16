# Workflow Automation

Monocle's workflow system is the typed DOM-automation vocabulary executed by the content script, plus the background-to-content execution path and the public message schema. It is the substrate automations lower onto (see [automations.md](./automations.md)): a workflow is always a flat list of **content-executable** steps — privileged operations (navigate, open URL, clipboard, run command) are automation engine operations, never workflow steps.

The system's hardest invariant is **lockstep**: the public `monocle-workflow-execute` schema accepts exactly the operations the executor implements, and a new op lands as one unit — type, schema entry, executor case, and tests. Unsupported ops fail loudly (`Unsupported step operation: <op>`), never silently.

## Status at a glance

| Area | Status |
| --- | --- |
| Type model (`shared/types/workflow.ts`) | Implemented — every member of the `Step` union executes |
| Public message schema (`shared/types/workflowValidation.ts`) | Accepts all 17 implemented ops |
| Execution routing (`background/workflows/execution.ts`) | Implemented (explicit tab / sender / context URL / active tab) |
| Content executor (`content/workflow/`) | Implemented for the full vocabulary |
| Variable interpolation (`{{var}}`) | Background-side, in the automation engine — content receives expanded strings; the executor never templates |
| Privileged ops (navigate, clipboard, openUrl, runCommand) | Automation engine ops (`background/automations/engine.ts`), not workflow steps |
| `expectNavigation` on `click`/`submit` | Optional automation-engine orchestration hint, **not content behaviour** — stripped during lowering, so the executor runs an ordinary action; the engine uses it to wait for the page load it triggers (see [automations.md](./automations.md#cross-navigation-expectnavigation)). A no-op on the raw-workflow path. |
| Debug tool command | Implemented (`debug-workflow`) |

## End-to-end execution path

```
command.execute() / automation engine segment / debug tool
  -> executeWorkflowOnTargetTab()        background/workflows/execution.ts
       -> resolveWorkflowTargetTabId()   pick target tab
       -> WorkflowSchema.safeParse(workflow)
       -> sendTabMessage(tabId, { type: "monocle-workflow-content-execute", workflow, context })
  -> content listener                    shared/hooks/useCommandPaletteStateRedux.tsx
       -> validateContentMessage(message)
       -> workflowExecutor.executeWorkflow(workflow)   content/workflow/executor.ts
       -> sendResponse({ result })
  -> unwrapWorkflowResult(response)       back in execution.ts
  -> { tabId, result } returned to caller
```

Entry surfaces in the background:

- **The public message handler** `background/messages/executeWorkflow.ts` handles the `monocle-workflow-execute` message. Messages reach it only after passing the schema (see [Validation](#validation-public-schema)).
- **The automation engine** (`background/automations/engine.ts`) lowers each contiguous content segment of a script to a `Workflow` and calls `executeWorkflowOnTargetTab` directly. It also uses one-step probe workflows (`wait`, `getText`) to answer branch/loop conditions.
- **Direct background callers** such as the debug tool (`background/commands/tools/debugWorkflow.ts`) and the GitHub website prototype call `executeWorkflowOnTargetTab` with in-code workflows. These bypass the message schema because the workflow never crosses the untrusted UI boundary, but the executor independently rejects unsupported ops.

### Target tab resolution

`resolveWorkflowTargetTabId` in `background/workflows/execution.ts` picks the tab to run on, in priority order:

1. **Explicit `tabId`** if provided (must be a positive integer, else throws `"Invalid workflow target tab id"`).
2. **Sender tab id** from `sender.tab.id` / `sender.validationContext.senderTab` for content-originated messages.
3. **Context URL match.** If `context.url` is set, query all tabs and match the first whose `URL.href` equals the context URL. A new-tab context throws `"Cannot execute page workflow from new-tab context"`; no matching tab throws. This keeps a workflow pinned to the page it was launched from even if focus changes.
4. **Active tab fallback** only when no context target exists.
5. Otherwise throws `"No workflow target tab found"`.

`executeWorkflowOnTargetTab` validates the workflow with `WorkflowSchema` before sending `monocle-workflow-content-execute` to the resolved tab and passes the response through `unwrapWorkflowResult`, which coerces anything malformed into `{ success: false, error: "Workflow execution returned an invalid result" }`.

### Content listener

The content script injects the real content runner from `content/components/ContentCommandPalette.tsx`; the shared listener lives in `shared/hooks/useCommandPaletteStateRedux.tsx` so new-tab/content palette state stays shared without importing `content/` from `shared/`. The listener validates `monocle-workflow-content-execute` with `ContentMessageSchema`, keeps the listener synchronous, and responds via `sendResponse` (returning a Promise from the listener is treated as the response by some runtimes). It logs only the workflow name and step count, never the full spec.

## The executor module (`content/workflow/`)

The executor was split from a single file into focused modules:

| File | Role |
| --- | --- |
| `content/workflow/executor.ts` | `WorkflowExecutor` core: step loop, retry/timeout policy, op dispatch, result + var aggregation |
| `content/workflow/dom.ts` | Selector resolution (css/text), visibility checks, targeting, environment-tolerant event helpers, native value setter |
| `content/workflow/interactionOps.ts` | `click`, `hover`, `focus`, `blur`, `scroll` |
| `content/workflow/formOps.ts` | `fill`, `type`, `key`, `select`, `check`/`uncheck`, `submit` |
| `content/workflow/domOps.ts` | `getText`, `removeElement`, `hideElement`, `injectCss` |
| `content/workflow/waitOps.ts` | `wait` |
| `content/workflow/index.ts` | Public surface (`workflowExecutor` singleton) |
| `content/workflow/testDom.ts` | Shared linkedom fixture (tests only) |

## The workflow type model

Defined in `shared/types/workflow.ts`. A `Workflow` is:

```ts
type Workflow = {
  version: "1.0"
  name?: string
  vars?: Record<string, string | number | boolean | null> // pre-expanded; seeds the var bag
  steps: Step[]
}
```

### Common step fields (`BaseStep`)

| Field | Type | Behavior |
| --- | --- | --- |
| `op` | `string` | Discriminant. |
| `id` | `string?` | Reported back in `StepResult.stepId`. |
| `description` | `string?` | Informational only. |
| `timeoutMs` | `number?` | Per-step timeout (wait steps own their timeout internally). |
| `retry` | `RetryPolicy?` | `{ retries, delayMs?, backoff? }`. |
| `targeting` | `TargetingOpts?` | `{ scrollIntoView?, ensureVisible? }`, both default `true`. |

### Selectors

```ts
type Selector =
  | { strategy: "css"; value: string; index?: number }
  | { strategy: "text"; value: string; exact?: boolean; within?: Selector; index?: number }
```

CSS lookups use `querySelectorAll` (invalid selectors throw — fail loudly); text lookups walk text nodes, match exact or substring on trimmed content, return the parent element, and support `within` scoping and `index` picking. Hidden text is excluded unless the caller opts in (non-`visible` wait states do).

### Implemented step vocabulary

| `op` | Purpose | Key fields | Notes |
| --- | --- | --- | --- |
| `click` | Click an element | `target`, `button?`, `clickCount?`, `delayMs?`, `modifiers?` | Native `click()` for plain left-clicks; full synthetic pointer/mouse sequence when options are set |
| `wait` | Wait for a condition | `for`: `{timeMs}` / `{selector, state?}` / `{urlIncludes}` / `{readyState}` | Polls every 50ms; default timeout 5s |
| `hover` | Hover an element | `target` | pointerover/mouseover/mouseenter/pointermove/mousemove |
| `focus` / `blur` | Focus management | `target` | |
| `fill` | Set an input value | `target`, `text`, `clear?`, `fire?` | Prototype value setter (framework-compatible); `clear: "none"` appends, others replace; fires input/change per `fire` flags. Non-editable targets fail loudly |
| `type` | Synthetic keystrokes | `target`, `keys`, `delayMs?` | Named keys (Enter, Backspace, …) vs literal text per entry; lower fidelity than fill by design |
| `key` | Key combo to the active element | `keys`, `delayMs?` | Modifier names accumulate onto the final key |
| `select` | Choose a `<select>` option | `target`, `by: {value?\|label?\|index?}`, `fireChange?` | Fails when no option matches |
| `check` / `uncheck` | Set checkbox state | `target` | Idempotent: clicks only when the state must change |
| `submit` | Submit a form | `target` | Non-form targets submit their closest enclosing form; prefers `requestSubmit()` |
| `scroll` | Scroll window/element | `target?`, `to`, `behavior?` | `to`: top/bottom/center/`{x,y}`/`{intoView}` |
| `getText` | Read text/attribute into a var | `from`, `attr?`, `toVar` | `attr` defaults to textContent; `"value"` reads the live value; values are never logged |
| `removeElement` | Remove element(s) | `target`, `all?` | Destructive; pages may re-render removed nodes |
| `hideElement` | Hide element(s) via injected style | `target`, `all?`, `scopeKey?` | Marker attribute + `display: none !important` rule under `<style data-monocle-style="scopeKey">`; reversible by removing that style element |
| `injectCss` | Inject scoped CSS | `css`, `scopeKey?` | Appends into the same scoped style element |

`scopeKey` is stamped by the automation engine (`automation-<id>`) so one script's page edits stay grouped.

### Results

```ts
type WorkflowResult = {
  success: boolean
  error?: string
  stepResults?: StepResult[]
  vars?: Record<string, string> // final var values incl. getText extractions
}
type StepResult = { stepId?: string; success: boolean; error?: string; duration?: number }
```

The executor runs steps in order and returns on the first failure (`"Step <op> failed: <error>"`). `vars` is returned on success **and** failure so partial extractions remain visible — the automation engine threads them into later segments and conditions.

## Validation (public schema)

`shared/types/workflowValidation.ts` defines the Zod schemas (re-exported from `shared/types/validation.ts`). `WorkflowStepSchema` is a strict discriminated union over exactly the 17 implemented ops; unknown ops and unknown fields are rejected at the message boundary. `injectCss` bodies are capped at 10k chars; selectors must be non-empty; `select.by` must name a value, label, or index.

Messages also pass the security wrapper in `background/utils/validation.ts` (rate limiting, 1MB total / 10k-char-per-string size limits) before schema validation. Direct background callers that bypass the public `monocle-workflow-execute` message are still validated before the workflow crosses into content, and content validates the resulting `monocle-workflow-content-execute` message before executing.

## Retry and timeout

- **Retry** (`executeStepWithPolicy`): attempts a step `(retry.retries ?? 0) + 1` times. Between failures it sleeps `delayMs` (default 0), doubled per prior attempt when `backoff === "exponential"`.
- **Timeout** (`executeStepWithTimeout`): non-`wait` steps with `timeoutMs` race a timer resolving to `{ success: false, error: "Timed out after <ms>ms" }`. `wait` steps manage their own timeout internally.
- A thrown error inside a step is caught and converted to a step failure; an unhandled throw at the workflow level returns `{ success: false, error, stepResults, vars }` with partial results.

## The lockstep invariant, restated

1. The public validation schema accepts **only** ops the executor implements.
2. A new op lands as one unit: type, schema entry, executor case, tests.
3. Unsupported ops fail loudly, never silently succeed.

Automations add a corollary, tested in `background/automations/lowering.test.ts`: every content-classified automation step must lower to a step `WorkflowStepSchema` accepts — a script that validates can never reach an executor case that fails as unsupported.

## Debug tool command

`background/commands/tools/debugWorkflow.ts` exports the `debug-workflow` action ("Debug Workflow - Click Submit Button") to exercise the whole path against a real page: resolves the tab, closes the palette, clicks the first `Submit` text target, and toasts the outcome. Automations deny it as a `runCommand` target.

## Manual test checklist

Automated tests use a `linkedom` DOM (`content/workflow/executor.test.ts`, `content/workflow/ops.test.ts`); real selector/event behavior still needs manual checks against `test-inputs.html`:

- Run **Debug Workflow**; confirm the palette closes first and the Submit target is clicked (or a clear error toast appears).
- `fill` on a React-controlled input: confirm the framework sees the value (input/change fire).
- `select`, `check`/`uncheck`, `submit` on the fixture form.
- `getText` into a var, surfaced via an automation toast.
- `hideElement` / `injectCss`: confirm the scoped `<style data-monocle-style>` element appears and removal restores the page.
- Hidden target with `ensureVisible: true`: fails with "Element is not visible".
- `wait` conditions: `visible`, `hidden`, `detached`, `urlIncludes`, `readyState`, and a timeout failure.
- An op not in the schema (e.g. a hand-crafted `navigate` step): confirm explicit rejection.

## Known issues and review notes

- `fill` fidelity on exotic editors: some custom editors reject programmatic value setting even with the prototype-setter trick; `type` exists as the lower-fidelity fallback.
- `removeElement` on re-rendering pages silently "fails" when the framework re-renders the node; `hideElement` + `injectCss` is the durable approach.
- Third-party DOM workflows (the GitHub prototype) are best-effort; retry/timeout do not make brittle selectors reliable.
- Workflows are treated as potentially sensitive; logging deliberately avoids dumping full specs or extracted values.

## Related docs

- [Automations](./automations.md) — the declarative automation layer that lowers onto workflows.
- [Architecture](./architecture.md) — runtime modes, boundaries, and the background/content split.
- [Messaging](./messaging.md) — the `monocle-workflow-execute` / `monocle-workflow-content-execute` protocol.
- [Commands: tools](./commands/tools.md) — where the `debug-workflow` command is cataloged.
