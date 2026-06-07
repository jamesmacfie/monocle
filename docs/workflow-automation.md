# Workflow Automation

Monocle defines a broad, typed model for browser DOM automation ("workflows") together with a background-to-content execution path, a public message schema, and a content-side executor. The **type model is intentionally far ahead of the implementation**: only `click` steps and a focused set of `wait` conditions are actually executable today, and they are the only steps the public `execute-workflow` schema accepts. Every other modeled operation (navigation, hover, fill, type, select, scroll, copy, clipboard, etc.) is **design-only** and will fail loudly if it ever reaches the runtime. This doc documents the full modeled design so future implementers know the intended shape, while clearly separating what is implemented from what is not.

## Status at a glance

| Area | Status |
| --- | --- |
| Type model (`shared/types/workflow.ts`) | Complete design sketch (16 step ops modeled) |
| Public message schema (`shared/types/validation.ts`) | Accepts `click` and `wait` only |
| Execution routing (`background/workflows/execution.ts`) | Implemented (explicit tab / sender / context URL / active tab) |
| Content executor (`content/workflowExecutor.ts`) | `click` + `wait` implemented; all other ops fail explicitly |
| Variable interpolation (`{{var}}`) | Not implemented |
| Privileged background ops (tab navigate, clipboard) | Not implemented |
| Debug tool command | Implemented (`debug-workflow`) |

## End-to-end execution path

```
command.execute() / debug tool
  -> executeWorkflowOnTargetTab()        background/workflows/execution.ts
       -> resolveWorkflowTargetTabId()   pick target tab
       -> sendTabMessage(tabId, { type: "execute-workflow-content", workflow, context })
  -> content listener                    shared/hooks/useCommandPaletteStateRedux.tsx
       -> workflowExecutor.executeWorkflow(workflow)   content/workflowExecutor.ts
       -> sendResponse({ result })
  -> unwrapWorkflowResult(response)       back in execution.ts
  -> { tabId, result } returned to caller
```

There are two entry surfaces in the background:

- **The public message handler** `background/messages/executeWorkflow.ts` (`executeWorkflow`) handles the `execute-workflow` message. It calls `executeWorkflowOnTargetTab` and wraps any thrown error into `{ result: { success: false, error } }`. Messages reach this handler only after passing the message schema (see [Validation](#validation-public-schema)).
- **Direct background callers** such as the debug tool (`background/commands/tools/debugWorkflow.ts`) and the GitHub website prototype (`background/commands/websites/github.ts`) call `executeWorkflowOnTargetTab` directly with an in-code `Workflow` object. These bypass the message schema because the workflow never crosses the untrusted UI boundary, but they still hit the same content executor, which independently rejects unsupported ops.

### Target tab resolution

`resolveWorkflowTargetTabId` in `background/workflows/execution.ts` picks the tab to run on, in priority order:

1. **Explicit `tabId`** if provided (must be a positive integer, else throws `"Invalid workflow target tab id"`).
2. **Sender tab id** from `sender.tab.id` / `sender.validationContext.senderTab` for content-originated messages.
3. **Context URL match.** If `context.url` is set, query all tabs and match the first whose `URL.href` equals the context URL (`urlsMatch`). A new-tab context throws `"Cannot execute page workflow from new-tab context"`; no matching tab throws `"No tab found for workflow context URL: ..."`. This is what keeps a workflow pinned to the page it was launched from even if focus changes before execution.
4. **Active tab fallback** only when no context target exists.
5. Otherwise throws `"No workflow target tab found"`.

`executeWorkflowOnTargetTab` then sends `execute-workflow-content` to the resolved tab and passes the response through `unwrapWorkflowResult`, which accepts either a raw `WorkflowResult` or a `{ result }` envelope and coerces anything malformed into `{ success: false, error: "Workflow execution returned an invalid result" }`.

### Content listener

The content script registers the `execute-workflow-content` listener in `shared/hooks/useCommandPaletteStateRedux.tsx`. It deliberately keeps the listener synchronous and responds via the `sendResponse` callback (returning a Promise from the listener is treated as the response by some runtimes). It logs only the workflow name and step count, not the full spec, then calls `workflowExecutor.executeWorkflow` and replies with `{ result }`.

## The workflow type model (design)

Defined in `shared/types/workflow.ts`. A `Workflow` is:

```ts
type Workflow = {
  version: "1.0"
  name?: string
  vars?: Record<string, string | number | boolean | null> // {{var}} expansion — NOT implemented
  steps: Step[]
}
```

### Common step fields (`BaseStep`)

Every step shares these fields. All are honored by the executor today except where noted.

| Field | Type | Behavior |
| --- | --- | --- |
| `op` | `string` | Discriminant. Only `click` and `wait` execute. |
| `id` | `string?` | Reported back in `StepResult.stepId`. |
| `description` | `string?` | Informational only. |
| `timeoutMs` | `number?` | Per-step timeout. See [Retry and timeout](#retry-and-timeout). |
| `retry` | `RetryPolicy?` | `{ retries, delayMs?, backoff? }`. See [Retry and timeout](#retry-and-timeout). |
| `targeting` | `TargetingOpts?` | `{ scrollIntoView?, ensureVisible? }`, both default `true`. Applied before clicks. |

### Selectors

```ts
type Selector =
  | { strategy: "css"; value: string; index?: number }
  | { strategy: "text"; value: string; exact?: boolean; within?: Selector; index?: number }
```

Both selector strategies are implemented (see [Element lookup](#element-lookup)).

### Modeled steps

The table below lists every modeled `op`. Only `click` and `wait` are implemented; the rest are design-only and the executor returns `Unsupported step operation: <op>` for them (and the public schema rejects them at the boundary).

| `op` | Purpose | Key fields | Implemented? |
| --- | --- | --- | --- |
| `navigate` | Navigate the tab (via background) | `url` | No — design only |
| `wait` | Wait for a condition | `for` (see below) | **Yes** |
| `click` | Click an element | `target`, `button?`, `clickCount?`, `delayMs?`, `modifiers?` | **Yes** |
| `hover` | Hover an element | `target` | No |
| `focus` | Focus an element | `target` | No |
| `blur` | Blur an element | `target` | No |
| `fill` | Set an input value | `target`, `text`, `clear?`, `fire?` | No |
| `type` | Type keys into an element | `target`, `keys`, `delayMs?` | No |
| `key` | Send a key combo to `activeElement` | `keys`, `delayMs?` | No |
| `select` | Choose an option | `target`, `by`, `fireChange?` | No |
| `check` | Check a checkbox | `target` | No |
| `uncheck` | Uncheck a checkbox | `target` | No |
| `submit` | Submit a form | `target` | No |
| `scroll` | Scroll window/element | `target?`, `to`, `behavior?` | No |
| `copy` | Read DOM into a var | `from`, `attr?`, `toVar` | No |
| `clipboard.write` | Write text to clipboard | `text`, `viaBackground?` | No |

A `BgMessage` model (`{ type: "tabs.navigate" }` / `{ type: "clipboard.write" }`) for privileged background operations is also defined but **not wired up**.

### Results

```ts
type WorkflowResult = { success: boolean; error?: string; stepResults?: StepResult[] }
type StepResult = { stepId?: string; success: boolean; error?: string; duration?: number }
```

The executor runs steps in order and returns on the first failure. On failure the top-level `error` is `"Step <op> failed: <error>"`, and `stepResults` contains one entry per attempted step (each with a measured `duration` in ms).

## Validation (public schema)

`shared/types/validation.ts` defines the Zod schemas for the `execute-workflow` message. They intentionally validate **only the executable subset**:

- `WorkflowStepSchema` is a discriminated union of **`ClickStepSchema` and `WaitStepSchema` only**. Any other `op` fails validation, so a `hover`/`fill`/`navigate` step never reaches the executor through the public message path.
- All step schemas use `.strict()`, so unknown fields are rejected.
- `ClickStepSchema`: `target` (selector), optional `button` (`left|middle|right`), `clickCount` (`1|2`), `delayMs` (non-negative int), `modifiers` (`Alt|Control|Meta|Shift`).
- `WaitForSchema` is a union of the four implemented conditions: `{ timeMs }`, `{ selector, state? }`, `{ urlIncludes }`, `{ readyState }`.
- `SelectorSchema` is recursive (via `z.lazy`) so `within` selectors are validated; CSS and text values must be non-empty.
- `RetryPolicySchema` requires a non-negative `retries`, optional non-negative `delayMs`, optional `backoff` (`none|exponential`).
- `ExecuteWorkflowMessageSchema` also carries `context` (browser context) and an optional positive-integer `tabId`.

Messages also pass through the security wrapper in `background/utils/validation.ts` (rate limiting, 1MB total / 10k-char-per-string size limits) before schema validation, but that file has no workflow-specific business rules — the workflow shape is enforced entirely by the Zod schemas above.

A malformed click step or an unsupported op rejected by the schema causes the message handler to throw `Invalid message: ...`; it never executes.

## Implemented executor capabilities

All in `content/workflowExecutor.ts` (class `WorkflowExecutor`, singleton export `workflowExecutor`).

### Element lookup

`findElement(selector, options?)` dispatches on `strategy`:

- **CSS** (`findElementByCSS`): runs `document.querySelectorAll(value)` and returns the element at `index` (default `0`), or `null`. An invalid CSS selector throws `Invalid CSS selector "...": <reason>` (surfaced as a step failure).
- **Text** (`findElementByText`): walks text nodes with a `TreeWalker` (`NodeFilter.SHOW_TEXT`). For each text node, trims `textContent` and matches by `exact` equality (when `exact: true`) or `String.includes` (substring, the default). Returns the matching node's `parentElement` at `index` (default `0`).
  - **Scoped text** (`within`): when `within` is set, the within-selector is resolved first and used as the tree-walk root. If the `within` element is not found, the text lookup returns `null`.
  - **Hidden text:** by default only visible parents are collected; the executor passes `includeHiddenText` when checking non-`visible` wait states so `hidden`/`detached`/`attached` waits can see hidden matches.
- An unknown selector `strategy` throws `Unsupported selector strategy: <strategy>`.

### Visibility checks

`isElementVisible(element)` returns `false` if the element is not connected, has a zero-width or zero-height bounding rect, or has computed `display: none` / `visibility: hidden`. Used both for element-lookup filtering and for `ensureVisible` targeting.

### Targeting (scroll into view + visibility gate)

`applyTargeting(element, targeting)` runs before a click:

- `ensureVisible` (default `true`): throws `"Element is not visible"` if `isElementVisible` is false — this is how hidden click targets fail loudly.
- `scrollIntoView` (default `true`): calls `element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })` then sleeps 100ms to let the scroll settle.

### Click execution

`executeClick` finds the target (failing with `Could not find element for selector: ...` if absent), applies targeting, then clicks. `clickElement` chooses one of two paths:

- **Plain native click:** if no click options are set, calls `HTMLElement.click()` directly.
- **Synthetic event sequence:** if any of `button`, `clickCount`, `delayMs`, or `modifiers` is set (`requiresSyntheticClick`), `dispatchClickSequence` fires a realistic ordered sequence so the configured options are observable:
  - `pointerover` → `mouseover` → `mousemove`
  - for each click (`clickCount`, default 1): `pointerdown` → `mousedown` → (sleep `delayMs` if set) → `pointerup` → `mouseup` → `click`; plus `contextmenu` when `button === "right"`
  - a trailing `dblclick` when `clickCount === 2`

`dispatchMouseEvent` sets `clientX`/`clientY` to the element's rect center, maps `button` (`left`→0, `middle`→1, `right`→2), sets `buttons` on down events, and sets `altKey`/`ctrlKey`/`metaKey`/`shiftKey` from `modifiers`. Tested click semantics (middle/right/modifier/double-click details and `delayMs` ordering) live in `content/workflowExecutor.test.ts`.

### Wait conditions

`executeWait` handles four condition shapes:

| Condition | Behavior |
| --- | --- |
| `{ timeMs }` | Simple `sleep(timeMs)` and succeeds. If `timeoutMs < timeMs`, it sleeps `timeoutMs` then fails with a timeout error. |
| `{ selector, state? }` | Polls `matchesSelectorState`. `state` defaults to `visible`. |
| `{ urlIncludes }` | Polls `window.location.href.includes(urlIncludes)`. |
| `{ readyState }` | Polls until `document.readyState` is at or past the requested state (ordered `loading < interactive < complete`). |

`matchesSelectorState` interprets `state`:

| `state` | Satisfied when |
| --- | --- |
| `attached` | element found (visibility ignored) |
| `visible` (default) | element found **and** visible |
| `hidden` | element found **and** not visible |
| `detached` | element not found |

Non-`timeMs` waits poll every `WAIT_POLL_INTERVAL_MS` (50ms) until satisfied or until `timeoutMs` (default `DEFAULT_WAIT_TIMEOUT_MS` = 5000ms). On timeout they fail with `Timed out waiting for <description>` (e.g. `visible selector {...}`, `URL to include "..."`, `document readyState complete`).

### Retry and timeout

- **Retry** (`executeStepWithPolicy`): attempts a step `(retry.retries ?? 0) + 1` times, stopping at the first success. Between failed attempts it sleeps `getRetryDelay`: `delayMs` (default 0), doubled per prior attempt when `backoff === "exponential"`.
- **Timeout** (`executeStepWithTimeout`): for non-`wait` steps with a `timeoutMs`, races the step against a timer that resolves to `{ success: false, error: "Timed out after <ms>ms" }`. **`wait` steps bypass this race** and manage their own timeout internally (so the table above's timeout numbers apply).
- A thrown error inside a step is caught and converted to `{ success: false, error }`; an unhandled throw at the workflow level returns `{ success: false, error, stepResults }` with whatever partial results were collected.

## Unsupported operations — must fail loudly

The following modeled operations are **not implemented**. The executor's `executeStep` switch handles only `click` and `wait`; everything else hits the `default` branch and returns `{ success: false, error: "Unsupported step operation: <op>" }`. The public schema additionally rejects them before they reach the content script.

- Navigation (`navigate`)
- Pointer/focus events other than click: `hover`, `focus`, `blur`
- Input mutation: `fill`, `type`, `key` (key combos), `select`, `check`, `uncheck`, `submit`
- `scroll` operations (note: scroll-*into-view* exists only as part of click targeting, not as a `scroll` step)
- Data extraction / clipboard: `copy`, `clipboard.write`
- Variable interpolation (`{{var}}` expansion of `vars`)
- Privileged background operations (`tabs.navigate`, background `clipboard.write`)

**Rule for implementers:** an unsupported or unrecognized step must always surface as an explicit failure, never a silent success. The current code upholds this both at the schema boundary and in the executor's `default` branch (verified by the "fails unsupported modeled operations explicitly" test). Preserve that invariant when adding new ops — add the schema entry, the executor case, and tests together.

## Debug tool command

`background/commands/tools/debugWorkflow.ts` exports the `debug-workflow` action command ("Debug Workflow - Click Submit Button"). It exists to exercise the whole path against a real page. On execute it:

1. Resolves the target tab via `resolveWorkflowTargetTabId({ context })`.
2. Sends `toggle-ui` to the tab to close the palette, then waits 200ms.
3. Runs an in-code workflow with a single `click` step targeting the first element whose text contains `Submit` (`{ strategy: "text", value: "Submit", exact: false, index: 0 }`) with `scrollIntoView` and `ensureVisible` enabled.
4. On success, sends a `monocle-toast` (level `success`) to the tab: "Debug workflow clicked the first Submit target".
5. On failure (including a workflow result with `success: false`), shows an error toast — a tab-scoped `monocle-toast` when a tab id is known, otherwise a background `show-toast`. The message includes the workflow error string.

Success and missing-target failure toasts are covered in `background/commands/tools/debugWorkflow.test.ts`.

## Manual test checklist

Automated tests use a `linkedom` DOM and stubbed events; real selector and event behavior still needs manual checks. Use `test-inputs.html` (the fixture page at the repo root, which has text inputs, forms, and buttons) as a target:

- Load the extension, open `test-inputs.html`, open the palette, and run **Debug Workflow**.
- Confirm the palette closes before the workflow runs.
- Confirm the first `Submit` text target is clicked, or a clear error toast appears when no match exists.
- CSS target: confirm the first matching element (or `index` Nth) is clicked.
- Text target: confirm both exact and substring matching.
- Scoped text: confirm `within` restricts the search root.
- Hidden target with `ensureVisible: true`: confirm it fails with "Element is not visible".
- Below-the-fold target: confirm `scrollIntoView` runs before the click.
- Unsupported op (e.g. `hover`): confirm it fails explicitly, never silently succeeds.
- `wait` conditions: exercise `visible`, `hidden`, `detached`, `urlIncludes`, `readyState`, and a timeout failure.

## Known issues and review notes

- The type model is far ahead of the executor. This is acceptable as a design sketch only because the public runtime schema exposes just the implemented subset; do not imply the broader model works.
- Third-party DOM workflows (e.g. the GitHub prototype in `background/commands/websites/github.ts`) are best-effort and depend on fragile selectors. Retry/timeout do not make brittle selectors reliable.
- Keep user-authored workflows treated as potentially sensitive; logging deliberately avoids dumping full specs.
- A small fixture-page harness (which `test-inputs.html` partly supports) would add high value because selector and event behavior can be exercised without real third-party sites.

## Related docs

- [Architecture](./architecture.md) — runtime modes, boundaries, and the background/content split.
- [Messaging](./messaging.md) — the full `execute-workflow` / `execute-workflow-content` message protocol.
- [Command schema](./command-schema.md) and [Command types](./command-types.md) — how the debug command and website commands are defined.
- [URL filtering](./url-filtering.md) — `urlRules` used by website commands that trigger workflows.
- [Commands: websites](./commands/websites.md) — the GitHub contextual command prototype that uses the executor.
- [Commands: tools](./commands/tools.md) — where the `debug-workflow` command is cataloged.
