# Workflow Automation

## Current Status

Status: partial.

Monocle has a broad typed workflow model for browser DOM automation, a
background-to-content message path, a debug command, and a content executor.
Only click steps are meaningfully implemented. Wait steps currently return
success without evaluating their condition, and most typed operations return
unsupported-operation errors.

## How It Is Hooked Together

- `shared/types/workflow.ts` defines the workflow spec. It includes navigation,
  wait, click, hover, focus, blur, fill, type, key combo, select, check,
  uncheck, submit, scroll, copy, and clipboard write steps.
- `shared/types/validation.ts` validates `execute-workflow` messages with a
  permissive step schema.
- `background/messages/executeWorkflow.ts` forwards workflow execution requests
  to the active tab as `execute-workflow-content`.
- `shared/hooks/useCommandPaletteStateRedux.tsx` listens for
  `execute-workflow-content` in the content script and runs the executor.
- `content/workflowExecutor.ts` executes workflow steps in sequence and returns
  step results.
- `background/commands/tools/debugWorkflow.ts` defines a debug command that
  closes the palette and tries to click a Submit button on the current page.
- `background/commands/websites/github.ts` uses the same executor path for the
  in-progress GitHub toggle-star command.

Implemented executor behavior:

- CSS selector resolution with `document.querySelectorAll`.
- Text selector resolution through a TreeWalker.
- Optional scoped text search through `within`.
- Basic visibility checks.
- Scroll into view.
- Click execution, preferring `HTMLElement.click()` with fallback event
  dispatch.
- Modifier flags in fallback click events.

Not implemented or effectively incomplete:

- Wait conditions.
- Navigation.
- Hover, focus, blur, fill, type, key combo, select, check, uncheck, submit,
  scroll, copy, and clipboard write.
- Retry policies and timeout handling.
- Variable interpolation.
- Privileged background operations such as tab navigation and clipboard write.

## Test Coverage

Automated test coverage: missing.

Build checks that currently touch this feature:

- `npm run tsc` validates workflow types and executor references.
- `npm run fmt:check` validates formatting/lint.
- `npm run build` validates background/content bundles.

There are no executor unit tests, fixture-page tests, browser integration tests,
or regression tests for selector behavior.

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
- Run a workflow with a wait condition and confirm current behavior is not
  trusted because wait is a no-op.

## Code Review Notes

- The type model is far ahead of the executor. That is acceptable for a design
  sketch, but docs and UI must not imply that the full spec works.
- `wait` returning success is the highest-risk behavior because it can make
  workflows appear reliable while skipping the synchronization they requested.
  It should fail as unsupported or be implemented before broader use.
- Logging is verbose and includes workflow specs. That is useful while
  debugging, but could expose page or workflow data if workflows become user
  authored.
- Timeout and retry fields exist in types but are not enforced. This should be
  fixed before workflows are used for brittle third-party sites.
- `HTMLElement.click()` bypasses some event sequencing compared with the
  fallback path. The behavior should be chosen intentionally per target type.
- GitHub automation depends on third-party DOM selectors. A future plugin system
  should treat these as best-effort hooks with graceful failure and clear user
  feedback.
- A small fixture-page test harness would give high value here because selector
  and event behavior can be tested without real third-party sites.

