# Workflow Automation Fix Plan

## Current Data Flow

Workflow commands send `execute-workflow` to the background or directly message
the active content script with `execute-workflow-content`. The background
forwards workflows to the active tab. The content-side listener in
`useCommandPaletteStateRedux` calls `content/workflowExecutor.ts` and returns a
`WorkflowResult`.

`shared/types/workflow.ts` describes a broad workflow model, but the content
executor currently implements only selector lookup, visibility checks, scroll
into view, and click behavior.

## Boundaries And Contracts

- Content script execution can interact with page DOM, but privileged actions
  such as tab navigation and robust clipboard writes belong in the background.
- Runtime validation must match the supported executable subset. Unsupported
  modeled operations must fail clearly.
- Workflow routing must target the intended tab, not whatever tab happens to be
  active after async delays.
- Workflow result failures must be surfaced to the command path and user-visible
  UI.
- Third-party DOM workflows are best-effort and must produce clear failure
  feedback.

## Confirmed Gaps

- `wait` returns success without checking its condition. This is the highest
  risk because workflows can pass while skipping synchronization.
- Workflow validation is permissive. The runtime schema requires only `op` and
  allows passthrough fields, so malformed `click` steps reach runtime.
- Debug Workflow ignores failure results from `execute-workflow-content`, so a
  missing target is logged but not surfaced as command failure.
- Workflow routing is active-tab based. Focus changes can send work to the
  wrong tab.
- Click semantics do not match the type contract. `HTMLElement.click()` is used
  before fallback event dispatch, so button, click count, delay, and modifier
  options are ignored for most elements.
- Variables, retry, timeout, navigation, clipboard, and most operation types
  are modeled but not implemented.
- Workflow logging prints full workflow specs, which is useful for debugging
  but should be treated carefully if user-authored workflows are introduced.

## Required Fixes

- Make `wait` honest:
  - Preferred: implement `timeMs`, selector `attached`, `visible`, `hidden`,
    `detached`, `urlIncludes`, and `readyState`.
  - Minimum acceptable interim fix: return unsupported-operation failure for
    `wait` instead of success.
- Replace permissive workflow step validation with a schema for the currently
  supported subset, or validate each operation shape before execution.
- Update Debug Workflow to unwrap `WorkflowResult`, show success/error toasts,
  and fail clearly when the target is missing.
- Add a tab targeting contract. Prefer sender-tab or explicit `tabId` routing
  over generic active-tab forwarding.
- Align click execution with the click step contract. If modifiers, button,
  click count, or delay are set, dispatch the full event sequence rather than
  using `HTMLElement.click()`.
- Decide whether broad workflow types are public future design or active API:
  - If future design, mark unsupported operations clearly in docs and runtime.
  - If active API, implement them in staged slices with tests.
- Implement retry and timeout before using workflows for brittle third-party
  pages beyond debug and best-effort website commands.

## Required Tests

- Unit tests for executor selector lookup: CSS, text, exact text, substring,
  `within`, index, hidden elements, and invalid selectors.
- Unit tests for wait behavior or explicit unsupported failure.
- Tests for malformed workflow message validation and unsupported operation
  failure.
- Tests for click semantics: left/right/middle, double-click, modifier-click,
  delay, scroll, and visibility enforcement.
- Tests for Debug Workflow surfacing missing-target failure.
- Routing tests proving workflow execution targets the intended tab when focus
  changes.
- Fixture-page checks using `test-inputs.html` or a dedicated workflow fixture.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New workflow validation, executor, routing, and debug-command tests pass.
- Manual smoke: run Debug Workflow on a fixture page with a Submit target and
  without one; confirm success and failure are both visible and accurate.
