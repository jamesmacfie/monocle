# Workflow Automation

## Current Status

Status: partial.

Monocle has a broad typed workflow model for browser DOM automation, a
background-to-content message path, a debug command, and a content executor.
Click steps and a focused set of wait conditions are implemented. Public
`execute-workflow` validation intentionally accepts only the executable subset:
`click` and implemented `wait` steps. Most typed operations remain future design
and fail explicitly if they reach the runtime.

## How It Is Hooked Together

- `shared/types/workflow.ts` defines the workflow spec. It includes navigation,
  wait, click, hover, focus, blur, fill, type, key combo, select, check,
  uncheck, submit, scroll, copy, and clipboard write steps.
- `shared/types/validation.ts` validates `execute-workflow` messages with a
  strict schema for the currently executable subset.
- `background/messages/executeWorkflow.ts` forwards workflow execution requests
  through `background/workflows/execution.ts`, which resolves a target tab from
  explicit `tabId`, sender tab, or context URL. Active-tab fallback is used only
  when no context target exists.
- `shared/hooks/useCommandPaletteStateRedux.tsx` listens for
  `execute-workflow-content` in the content script and runs the executor.
- `content/workflowExecutor.ts` executes workflow steps in sequence and returns
  step results.
- `background/commands/tools/debugWorkflow.ts` defines a debug command that
  closes the palette, runs the Submit-click workflow on the resolved tab, and
  shows success or error toasts from the returned `WorkflowResult`.
- `background/commands/websites/github.ts` uses the same executor path for the
  in-progress GitHub toggle-star command.

Implemented executor behavior:

- CSS selector resolution with `document.querySelectorAll`.
- Text selector resolution through a TreeWalker.
- Optional scoped text search through `within`.
- Basic visibility checks.
- Scroll into view.
- Click execution, preferring `HTMLElement.click()` only for plain clicks and
  dispatching a mouse event sequence when button, click count, delay, or
  modifier options are provided.
- Modifier flags, button, click count, double-click, context-menu, and click
  delay handling for synthetic click paths.
- Wait conditions for `timeMs`, selector `attached`, `visible`, `hidden`,
  `detached`, `urlIncludes`, and document `readyState`.
- Per-step retry and timeout policies for supported content-side operations.

Not implemented or effectively incomplete:

- Navigation.
- Hover, focus, blur, fill, type, key combo, select, check, uncheck, submit,
  scroll, copy, and clipboard write.
- Variable interpolation.
- Privileged background operations such as tab navigation and clipboard write.

## Test Coverage

Automated test coverage now includes:

- `content/workflowExecutor.test.ts` for CSS/text selector behavior, scoped
  text lookup, hidden and invalid targets, wait conditions, click semantics,
  delay, and unsupported operations.
- `shared/types/validation.test.ts` for workflow message validation, malformed
  click steps, unsupported operations, and explicit tab targeting.
- `background/workflows/execution.test.ts` for explicit, sender-tab, and
  context-URL routing plus malformed result unwrapping.
- `background/commands/tools/debugWorkflow.test.ts` for success and
  missing-target failure toasts.

Build checks that touch this feature:

- `pnpm run tsc` validates workflow types and executor references.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm test` includes the focused workflow coverage above.
- `pnpm run build` validates background/content bundles.

## Manual Test Checklist

- Run the extension and open `test-inputs.html` if available in the browser.
- Open the palette and run Debug Workflow.
- Confirm the palette closes before workflow execution.
- Confirm the intended Submit text target is clicked, or that a clear error is
  shown if no matching element exists.
- Test a workflow with a CSS target and confirm the first matching element is
  clicked.
- Test a workflow with a text target and confirm exact and substring matching
  behavior.
- Test a hidden target and confirm visibility checks reject it when
  `ensureVisible` is true.
- Test a target below the fold and confirm scrolling happens.
- Run a workflow with an unsupported operation and confirm it fails explicitly.
- Run workflows with `wait` conditions for visible, hidden, detached,
  `urlIncludes`, `readyState`, and timeout failure.

## Code Review Notes

- The type model is far ahead of the executor. That is acceptable for a design
  sketch, but the public runtime schema currently exposes only the implemented
  subset.
- Wait conditions are implemented, but third-party DOM workflows remain
  best-effort and need manual fixture checks before relying on them.
- Logging now avoids dumping full workflow specs, but user-authored workflows
  should still be treated as potentially sensitive.
- Retry and timeout are enforced for supported content-side steps. They do not
  make brittle third-party selectors reliable by themselves.
- `HTMLElement.click()` is used only for plain clicks; option-bearing clicks
  use synthetic events so the configured button, modifiers, count, and delay are
  observable.
- GitHub automation depends on third-party DOM selectors. A future plugin system
  should treat these as best-effort hooks with graceful failure and clear user
  feedback.
- A small fixture-page test harness would give high value here because selector
  and event behavior can be tested without real third-party sites.
