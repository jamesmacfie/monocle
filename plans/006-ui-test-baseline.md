# Plan 006: Establish a DOM test baseline and characterize the CMDK↔Redux sync

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- vitest.config.ts shared/components/Command/ shared/hooks/useCommandNavigation.tsx package.json`
> Several shared files were modified-uncommitted at planning time; compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (unblocks future UI refactors; see Maintenance notes)
- **Category**: tests
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

The project's own CLAUDE.md says: "CMDK search state is synchronized with
Redux in a few direct/fragile places. Any navigation, Escape, Backspace, or
search restoration change needs manual regression checks." Today that
fragility is structurally untestable: vitest runs with `environment: "node"`,
so not a single React component in the repo has a rendered test — the entire
palette UI (both modes) is a black box guarded only by manual checks. This
plan adds the missing layer (jsdom + React Testing Library, opt-in per file)
and writes the first characterization tests for exactly the behaviors
CLAUDE.md says must never silently regress. Every future palette refactor —
including the audit's deferred navigation-hook/slice consolidation and the
CommandItem re-render fix — needs this baseline to land safely.

## Current state

- `vitest.config.ts` (complete file as of planning):

```ts
import { defineConfig } from "vitest/config"
import { WxtVitest } from "wxt/testing/vitest-plugin"

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
})
```

- `package.json` devDeps: vitest `^4.1.8`, `linkedom` 0.18.12 (used manually
  in 3 tests, e.g. `content/workflowExecutor.test.ts` — NOT as a vitest
  environment), React 19, `@types/react` 19. There is **no**
  `@testing-library/react`, **no** `jsdom`.
- `shared/components/Command/CommandPalette.tsx` — shared palette shell.
  Props (verified from its use in
  `content/components/ContentCommandPalette.tsx`):
  `items`, `executeCommand`, `close`, `onRefreshCommands`. It reads
  `selectIsCapturing` from the Redux store via `useAppSelector`, so it must
  render inside a `Provider`.
- `content/components/ContentCommandPaletteWithState.tsx` — the store-wiring
  exemplar: creates the app store (`createAppStore(...)`) and the palette
  send-message function. **Read this file first** — your test harness
  mirrors it with a mocked sendMessage.
- `shared/hooks/useCommandNavigation.tsx` — the fragile sync mechanics the
  tests must characterize. Verified behaviors as of planning:
  - Search restoration on page change pokes the DOM directly
    (`inputElement.value = currentPage.searchValue` + synthetic `input`
    event), guarded by an `ignoreSearchUpdate` ref that is consumed-and-reset
    by the next `updateSearchValue` call (and by a 100ms timer in
    `_clearAndResetSearch`).
  - Debounced (200ms) `searchCurrentPage` dispatch keyed on the Redux
    `searchValue`; the effect's cleanup cancels the pending timer when the
    page changes (this non-firing is itself a behavior to pin).
  - `navigateTo` clears the search input on success via
    `_clearAndResetSearch`.
- `shared/components/Command/paletteKeyboard.test.ts` and
  `shared/store/slices/navigation.slice.test.ts` — existing pure-function
  tests; the component tests complement (don't replace) them.
- `shared/hooks/useGetCommands.tsx` and `useSendMessage.tsx` — the messaging
  seam; in tests, sendMessage is a `vi.fn` returning canned
  `get-commands`/`search-commands`/`get-children-commands` responses.

## Commands you will need

| Purpose      | Command                                                  | Expected on success |
|--------------|----------------------------------------------------------|---------------------|
| Install deps | `pnpm add -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom` | exit 0 |
| Typecheck    | `pnpm run tsc`                                           | exit 0              |
| Tests        | `pnpm test`                                              | all pass            |
| One file     | `pnpm test -- shared/components/Command/CommandPalette.dom.test.tsx` | all pass |
| Format       | `pnpm run fmt:check`                                     | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `package.json` / `pnpm-lock.yaml` (the four devDeps above only)
- `shared/test/renderPalette.tsx` (create — shared test harness)
- `shared/components/Command/CommandPalette.dom.test.tsx` (create)
- `shared/hooks/useCommandNavigation.dom.test.tsx` (create)
- `vitest.config.ts` — ONLY if the per-file pragma approach (Step 1) proves
  insufficient; prefer zero config change.

**Out of scope** (do NOT touch):
- Any production source file. This plan is purely additive test
  infrastructure — if a test reveals a bug, record it in the test as
  `test.todo`/a skipped test with a comment and report it; do NOT fix it
  here. (Characterization = pin current behavior, even if odd.)
- Migrating existing linkedom-based tests.
- The default `environment: "node"` for existing tests.

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/006-ui-test-baseline`, message
  `test: add jsdom baseline and palette characterization tests`.

## Steps

### Step 1: Install deps and prove the environment works

Run the install command above. Create a trivial probe inside one of the new
test files first:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("jsdom baseline", () => {
  it("renders", () => {
    render(<div data-testid="probe">ok</div>)
    expect(screen.getByTestId("probe").textContent).toBe("ok")
  })
})
```

The `// @vitest-environment jsdom` pragma on line 1 opts a single file into
jsdom while everything else stays on node — no `vitest.config.ts` change.
Name DOM test files `*.dom.test.tsx` so the layer is greppable.

**Verify**: `pnpm test -- shared/components/Command/CommandPalette.dom.test.tsx` → 1 pass

### Step 2: Build the render harness

Create `shared/test/renderPalette.tsx`. Read
`content/components/ContentCommandPaletteWithState.tsx` and mirror its store
construction with a mocked message function:

- `createMockSendMessage(handlers)` — a `vi.fn` that dispatches on
  `message.type` and returns canned responses. Defaults:
  `get-commands` → a small fixture (3 action suggestions + 1 group),
  `search-commands` → echo `{ results: [...], seq: message.seq, query }`,
  `get-children-commands` → 2 child suggestions.
  Build fixture suggestions matching the `Suggestion` type in
  `shared/types/ui.ts` (read it; fill only required fields).
- `renderPalette({ sendMessage } = {})` — creates the store the same way
  `ContentCommandPaletteWithState` does, renders `<Provider store={store}>`
  wrapping `CommandPalette` with `items` fixture, a `vi.fn` `executeCommand`,
  `close`, and `onRefreshCommands`, and returns
  `{ store, user: userEvent.setup(), ...renderResult, sendMessage }`.
- Timers: the sync code uses 100ms/200ms timeouts. Use real timers +
  `await waitFor(...)` from RTL for assertions (fake timers fight userEvent;
  only reach for `vi.useFakeTimers` if a test is flaky, and then use
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`).

**Verify**: `pnpm run tsc` → exit 0

### Step 3: Characterize the fragile behaviors

In `CommandPalette.dom.test.tsx`, using the harness — one test per CLAUDE.md
fragile path:

1. **Typing reaches Redux and triggers a debounced search**: type "tab" in
   the search input → `waitFor` store state `currentPage.searchValue === "tab"`
   and sendMessage called with `{ type: "search-commands", query: "tab" }`
   exactly once (debounce collapsed the keystrokes).
2. **Navigate into a group clears search**: type "x", select the group row
   (keyboard: ArrowDown to it + Enter, or `user.click`) → `waitFor` the child
   page on the stack and input value `""`, and the new page's
   `searchValue === ""`.
3. **Backspace on empty search navigates back; search is restored**: from
   the child page (search empty), press Backspace → back on root page AND
   the input's DOM value equals the root page's prior search value
   (this pins the direct-DOM restoration path in `useCommandNavigation`'s
   page-change effect).
4. **Backspace with non-empty search does NOT navigate**: on child page type
   "y", press Backspace → still on child page, search becomes "y" minus the
   handled editing (i.e. normal text editing, page stack length unchanged).
5. **Escape behavior**: on a child page Escape navigates back (or whatever
   `getPaletteKeyboardCommand` decides — pin the *current* behavior; read
   `shared/components/Command/paletteKeyboard.ts` to know which); on the
   root page Escape calls the `close` prop.
6. **Stale search responses are dropped**: respond to the first
   `search-commands` with a *delayed* promise carrying `seq: 1` and to a
   second with immediate `seq: 2`; after both settle, store search results
   are seq-2's (pins the slice's seq guard).

In `useCommandNavigation.dom.test.tsx` (render a minimal consumer or test
through the palette where simpler):

7. **Pending search is cancelled by navigation**: type a query, navigate to
   a group before 200ms elapses → no `search-commands` message is ever sent
   for that query (pins the effect-cleanup behavior the audit verified).

Where a test exposes ambiguous/odd behavior, pin it with a comment
`// characterization: current behavior, not necessarily desired` rather than
judging it.

**Verify**: `pnpm test -- shared/components/Command` → all pass (≥7 new tests)

### Step 4: Full suite + docs breadcrumb

Run the full suite. Add a short comment block at the top of
`shared/test/renderPalette.tsx` explaining the `*.dom.test.tsx` + pragma
convention so the next author finds it.

**Verify**: `pnpm test` → all pass; `pnpm run tsc` → exit 0; `pnpm run fmt:check` → exit 0

## Test plan

The plan IS the test plan (Steps 1–3). Structural patterns: existing store
tests in `shared/store/slices/navigation.slice.test.ts` for fixture shapes;
`shared/components/Command/paletteKeyboard.test.ts` for keyboard expectations.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 with ≥7 new DOM tests passing
- [ ] Existing tests still run under node env (`grep -L "vitest-environment" $(git ls-files '*.test.ts') | head` — old files have no pragma)
- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] Only the four named devDeps were added (`git diff package.json`)
- [ ] No production source file modified (`git status` — only test files, harness, package.json, lockfile, plans/README.md)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- cmdk fails to render under jsdom (it relies on real DOM measurement in
  places) and the failure isn't resolved by standard jsdom polyfills
  (`scrollIntoView`, `ResizeObserver` stubs — adding those to the harness is
  in scope). Two failed attempts → stop.
- `CommandPalette`'s props no longer match
  (`items/executeCommand/close/onRefreshCommands`) — the palette was
  refactored; re-derive from `ContentCommandPalette.tsx` and proceed only if
  the change is mechanical, otherwise stop.
- A characterization test fails in a way that reveals a real bug you cannot
  pin (behavior is nondeterministic across runs) — report the flake with
  evidence instead of retry-looping.
- The WxtVitest plugin conflicts with the jsdom pragma (test file can't load
  `fakeBrowser`) — stop and report; the fallback (vitest `projects` config)
  is a bigger change the maintainer should approve.

## Maintenance notes

- This baseline is a prerequisite the audit identified for two deferred
  refactors: consolidating `useCommandNavigation` with the navigation slice,
  and fixing the per-keystroke re-render of every `CommandItem` row (memo is
  currently defeated by the `currentPage` prop). Do not attempt those
  refactors until these characterization tests are green in CI.
- When palette behavior is *intentionally* changed, update the
  characterization test in the same PR and say so in the test name.
- Deferred: content-overlay shadow-DOM injection tests and new-tab-mode
  rendering tests (same harness, different wrapper) — worth adding when the
  harness proves stable.
