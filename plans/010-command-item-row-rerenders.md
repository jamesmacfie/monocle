# Plan 010: Make CommandItem's memo actually work (stop re-rendering every row per keystroke)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- shared/components/Command/ shared/store/slices/navigation.slice.ts`
> `shared/components/Command/CommandPalette.tsx` had uncommitted
> modifications at planning time — compare the "Current state" excerpts
> against the live code regardless; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 006 (DOM test baseline — the characterization tests it adds
  are the safety net for this change; do NOT execute this plan before 006 is
  DONE)
- **Category**: perf
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

`CommandItem` is wrapped in `memo()`, but `CommandList` passes the whole
`currentPage` object to every row. Every keystroke in the palette dispatches
`updateSearchValue`, which produces a new `currentPage` object — so the memo
comparison fails for **every mounted row on every keystroke**, including the
window between keystroke and debounced results where nothing visible changed.
On form pages it's worse: typing in one inline input updates `formValues`,
re-rendering every other row. Each row render runs cmdk's `useCommandState`
subscription work, a permissions hook, and ts-pattern matching. The memo
comment in the file says it exists as "insurance against re-rendering every
row body when unrelated parent state changes between keystrokes" — the
`currentPage` prop defeats exactly that insurance.

The fix: rows receive only what they read — a `hasParent` boolean — and the
two `currentPage`-dependent behaviors (submit-time form validation, the
text-list input) move up or narrow.

## Current state

Relevant files, as of planning:

- `shared/components/Command/CommandItem/index.tsx` (279 lines) — the row.
  Uses `currentPage` in exactly three places:
  1. line 135: `if (currentPage.parent && Array.isArray(name))` — collapse
     "Parent > Child" names to just "Child" when inside a child page;
  2. lines 243–248 (submit rows only): validates the page's form before
     calling `onSelect`:

```tsx
        .with("submit", () => (
          <CommandItemSubmit
            actionLabel={...}
            inputRef={submitRef}
            onSubmit={() => {
              const fields = collectInputFieldsFromSuggestions(
                currentPage.commands.suggestions || [],
              )
              const result = validateFormValues(
                currentPage.formValues || {},
                fields,
              )
              if (!result.isValid) {
                toast("error", "Form is invalid. Check inputs.")
                return
              }
              onSelect(suggestion.id)
            }}
          />
        ))
```

  3. line 94: passes `currentPage` through to `CommandItemTextList`
     (text-list inline input — read that component to see which fields it
     uses; expected: `formValues` for its field and possibly suggestion
     context).

  Memo at lines 275–278:

```tsx
// Memoized: background-owned search caps the mounted row count at ~50, so
// this is insurance against re-rendering every row body when unrelated parent
// state changes between keystrokes.
export const CommandItem = memo(CommandItemComponent)
```

- `shared/components/Command/CommandList.tsx` — maps search results,
  favorites, and suggestions to `<CommandItem ... currentPage={currentPage}>`
  (the three render sites near lines 116–140). It already holds
  form-validation logic of its own (`collectInputFieldsFromSuggestions` +
  `validateFormValues` usage near lines 68–89) — the submit validation
  belongs up here with it.
- `shared/store/slices/navigation.slice.ts` — `updateSearchValue` reducer
  (lines ~338–355) replaces the current page object per keystroke (correct
  Redux immutability; the fix is in what props rows receive, not here).
- Note: other inline-input components (`CommandItemInput`,
  `CommandItemSelect`, etc.) do NOT receive `currentPage` — only `field` and
  refs — so the row's own subtree is already mostly page-independent.
- `onSelect` and `onInputSubmit` props: check how CommandList constructs
  them. If they're inline closures recreated per render, memo still fails
  after the `currentPage` prop is removed — they must be stabilized
  (`useCallback`) as part of this plan.

Conventions: function components + hooks, `memo` for rows, ts-pattern
`match` for type dispatch. Tests for palette behavior live in
`shared/components/Command/*.dom.test.tsx` once plan 006 lands — those
characterization tests MUST be green before and after this change.

## Commands you will need

| Purpose   | Command                                                | Expected on success |
|-----------|--------------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                         | exit 0              |
| Tests     | `pnpm test`                                            | all pass            |
| DOM tests | `pnpm test -- shared/components/Command`               | all pass            |
| Format    | `pnpm run fmt:check`                                   | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `shared/components/Command/CommandItem/index.tsx`
- `shared/components/Command/CommandItem/CommandItemTextList.tsx` (narrow its
  props)
- `shared/components/Command/CommandList.tsx`
- `shared/components/Command/CommandItem/CommandItem.dom.test.tsx` (create —
  requires plan 006's harness)

**Out of scope** (do NOT touch):
- `shared/store/slices/navigation.slice.ts` — no state-shape changes; the
  per-keystroke new-page-object is correct Redux.
- `CommandPalette.tsx`, `useCommandNavigation.tsx` — the fragile CMDK sync
  layer; this plan must not require changes there. If it does, stop.
- Virtualization — rejected for now (cmdk keyboard-navigation risk; row count
  is capped at ~40-50 by the background).
- The other `CommandItem*` leaf components (Input/Select/Switch/Multi/Color/
  Submit/Action/Display) beyond what Step 2 specifies for Submit.

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/010-row-rerenders`, message
  `perf: stop currentPage prop from defeating CommandItem memo`.

## Steps

### Step 1: Replace the `currentPage` prop with narrow props

In `CommandItem/index.tsx`, change `CommandItemProps`:

```tsx
export interface CommandItemProps {
  suggestion: Suggestion
  onSelect: (id: string) => void
  hasParent: boolean            // was: currentPage.parent truthiness
  onSubmitForm: (id: string) => void  // submit rows delegate validation up
  onInputSubmit?: () => void
}
```

- Line 135 becomes `if (hasParent && Array.isArray(name))`.
- The text-list early-return (line ~86–99) passes narrow props instead of
  `currentPage` — see Step 3.

### Step 2: Move submit validation up to CommandList

- In `CommandItem`, the `"submit"` branch's `onSubmit` becomes just
  `() => onSubmitForm(suggestion.id)` (keep the permissions/confirmation
  behavior of `handleSelect` untouched — note the submit branch bypasses
  `handleSelect` today and must continue to do so).
- In `CommandList`, create the validator once:

```tsx
const handleSubmitForm = useCallback((id: string) => {
  const fields = collectInputFieldsFromSuggestions(
    currentPage.commands.suggestions || [],
  )
  const result = validateFormValues(currentPage.formValues || {}, fields)
  if (!result.isValid) {
    toast("error", "Form is invalid. Check inputs.")
    return
  }
  onSelect(id)
}, [currentPage.commands.suggestions, currentPage.formValues, onSelect, toast])
```

  (Adapt names to CommandList's actual local identifiers — it may already
  have a near-identical validation block near lines 68–89; reuse/merge with
  it rather than duplicating, and keep the toast message text identical:
  `"Form is invalid. Check inputs."`.)
- IMPORTANT: `handleSubmitForm`'s identity changes when `formValues` change —
  that's fine; it only re-renders rows when form state actually changed,
  which is the correct invalidation. On non-form pages its identity is
  stable across search keystrokes **only if** `currentPage.commands.suggestions`
  and `currentPage.formValues` are reference-stable across `updateSearchValue`
  dispatches. **Verify this in the reducer** (`navigation.slice.ts`
  `updateSearchValue`): it must spread the page but keep `commands` and
  `formValues` references. If it deep-copies them, depend on those inner
  references in the `useCallback` deps exactly as written above — reference
  stability of the inner objects is what makes this work. If the reducer
  recreates them per keystroke, STOP (the fix would need a reducer change,
  which is out of scope).

### Step 3: Narrow CommandItemTextList's props

Read `CommandItemTextList.tsx`. Replace its `currentPage: Page` prop with
exactly the fields it reads (expected: the form value for its field id, plus
a setter or dispatch it already gets elsewhere). If it turns out to read
broad page state (e.g. iterates all suggestions), keep its prop surface as
narrow as honestly possible and document what stayed; text-list rows are
rare so they may keep re-rendering, but they must not force `currentPage`
back into `CommandItemProps`.

### Step 4: Stabilize the remaining row props in CommandList

- Pass `hasParent={Boolean(currentPage.parent)}` (a primitive — memo-safe).
- Ensure `onSelect` and `onInputSubmit` passed to rows are `useCallback`-
  stable (check their current construction; wrap if inline).
- Triple-check the three row-render sites (searchResults, favorites,
  suggestions) all switched to the new props.

**Verify** (after steps 1–4): `pnpm run tsc` → exit 0;
`pnpm test -- shared/components/Command` → all pass (006's characterization
tests prove Escape/Backspace/search/submit behavior unchanged)

### Step 5: Render-count regression test

Create `shared/components/Command/CommandItem/CommandItem.dom.test.tsx`
(`// @vitest-environment jsdom`, using plan 006's `renderPalette` harness):

1. Render the palette with ≥3 action suggestions. Instrument renders by
   wrapping a probe: re-export or test via a render-counting child — the
   simplest honest approach is a `vi.fn` inside a test-only wrapper
   component around `CommandItemAction`… if that requires production
   changes, instead assert indirectly: type one character into the search
   input (before debounce fires) and assert via React Profiler API
   (`<Profiler onRender={spy}>` wrapping the list in the test) that the
   number of row commits did not scale with row count (Profiler is a
   test-only wrapper — allowed).
2. Assert behavior parity: submit row with an invalid required field shows
   the "Form is invalid. Check inputs." toast and does not call
   `executeCommand`; with valid values it does.

If plan 006's harness proves too coarse for render counting after two
attempts, drop test 1, keep test 2, and note it in the README status row.

**Verify**: `pnpm test` → all pass

## Test plan

Covered in Steps 4–5. Pattern sources: plan 006's
`CommandPalette.dom.test.tsx` and harness. The non-negotiable gate is that
all of 006's characterization tests pass unchanged — they encode the
palette behavior this refactor must preserve.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0, including 006's characterization tests unchanged
- [ ] `grep -n "currentPage" shared/components/Command/CommandItem/index.tsx` → no matches
- [ ] `grep -n "currentPage={currentPage}" shared/components/Command/CommandList.tsx` → no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 006 is not DONE (no DOM harness exists) — this plan must not be
  executed against an untested palette.
- The `updateSearchValue` reducer recreates `commands`/`formValues`
  references per keystroke (see Step 2's verification) — the memo win
  requires inner-reference stability, and changing the reducer is out of
  scope.
- `CommandItemTextList` turns out to need genuinely broad page state.
- Any 006 characterization test fails after the refactor and the fix isn't
  an obvious prop-threading mistake — behavior parity is the hard
  requirement.

## Maintenance notes

- The row contract is now "primitives and stable callbacks only." Reviewers
  should reject any future prop on `CommandItemProps` that is a per-render
  object (the memo silently dies again, and nothing will fail — consider
  asking for a render-count test alongside any such change).
- If the background's top-N cap ever rises well past ~50 rows,
  virtualization becomes worth revisiting (rejected this round for cmdk
  keyboard-navigation risk).
- Deferred: per-keystroke re-render of `CommandList` itself (it legitimately
  reads `searchValue`); the win here is confining the cascade to one
  component instead of N rows.
