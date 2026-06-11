# Plan 003: Stop sending a background message for every keystroke on every page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- shared/hooks/useGlobalKeybindings.tsx shared/utils/robust-key-capture.ts`
> Note: `shared/hooks/useGlobalKeybindings.tsx` was MODIFIED-uncommitted at
> planning time, so also compare the live code against the "Current state"
> excerpts; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

Monocle's content script installs a capture-phase keydown handler on every
page the user visits. For **every keystroke outside an editable element**, the
handler sends an `execute-keybinding` message to the background service
worker — even when the key has nothing to do with any binding. Pressing `j`
to scroll Reddit, arrow keys in a PDF viewer, every keyboard-driven page on
the web: each keypress wakes (or keeps alive) the MV3 service worker, runs
message validation and registry lookup, and round-trips a response. The cost
is battery/CPU on every page, constant worker churn, and after worker idle
the first keystroke pays a registry rebuild for a key that was never bound.

The fix is cheap because the hook **already maintains a local snapshot** of
all exact bindings and sequence prefixes (`exactKeybindingsRef`,
`sequencePrefixesRef`, refreshed on settings changes). It currently uses the
snapshot only to decide preemptive suppression — not to gate the message.
Gate the message with the same predicate and unbound keys never leave the
page.

## Current state

Relevant files:

- `shared/hooks/useGlobalKeybindings.tsx` (~200 lines; modified-uncommitted)
  — installs `RobustKeyCapture`, maintains the local snapshot, sends the
  message. The hook is used by `content/components/ContentCommandPalette.tsx`
  (every page) and `newtab/components/NewTabCommandPalette.tsx`.
- `shared/utils/robust-key-capture.ts` — calls
  `options.shouldPreemptivelySuppress(keyString, event)` synchronously, then
  always calls `await options.onKeyPress(keyString, event)` for every
  captured keystroke. Suppression after the `await` is too late to prevent
  browser default — which is exactly why the preemptive path exists.
- `background/messages/getKeybindingState.ts` — serves the snapshot
  (`exactKeybindings`, `sequencePrefixes`).
- `content/components/ContentCommandPalette.tsx` — subscribes to
  `subscribeSiteSdkCommandsChanged(() => fetchCommands())` (site SDK commands
  can appear at runtime and may carry keybindings).

Key excerpts from `shared/hooks/useGlobalKeybindings.tsx` as of planning:

```tsx
const refreshKeybindingState = useCallback(async () => {
  try {
    const response = (await sendMessage(
      { type: "get-keybinding-state" },
      getContextOverride(),
    )) as KeybindingStateResponse

    exactKeybindingsRef.current = new Set(response.exactKeybindings ?? [])
    sequencePrefixesRef.current = new Set(response.sequencePrefixes ?? [])
  } catch (error) { /* resets both to empty sets */ }
}, [getContextOverride, sendMessage])

const isKnownHandledSequence = useCallback((keybinding: string): boolean => {
  return (
    exactKeybindingsRef.current.has(keybinding) ||
    sequencePrefixesRef.current.has(keybinding)
  )
}, [])
```

```tsx
const keyCapture = new RobustKeyCapture({
  debug: false,
  shouldPreemptivelySuppress: (keyString: string): boolean => {
    if (isCapturing) return false
    const existingSequence = localSequenceRef.current
    const continuedSequence =
      existingSequence.length > 0
        ? sequenceKey([...existingSequence, keyString])
        : keyString
    return (
      isKnownHandledSequence(continuedSequence) ||
      isKnownHandledSequence(keyString)
    )
  },
  onKeyPress: async (keyString: string): Promise<boolean> => {
    if (isCapturing) return false
    try {
      const response = (await sendMessage(
        { type: "execute-keybinding", keybinding: keyString },
        getContextOverride(),
      )) as ExecuteKeybindingResponse
      // ... handles response.pending (sequence in progress), success, etc.
```

And from `shared/utils/robust-key-capture.ts` (`handleKeydown`):

```ts
const suppressPreemptively =
  this.options.shouldPreemptivelySuppress?.(keyString, keyboardEvent) === true
if (suppressPreemptively) {
  this.suppressEvent(keyboardEvent)
}
if (this.options.onKeyPress) {
  const handled = await this.options.onKeyPress(keyString, keyboardEvent)
  ...
```

How sequences work (important for correctness of the gate): the background
owns multi-stroke sequence state. The hook mirrors it in
`localSequenceRef` — updated when a response comes back `pending: true`
(`updateLocalSequenceForPendingStroke`), cleared on success/failure and on a
900ms local timer. So the predicate "this key is an exact binding, OR a
known prefix, OR continues the current local sequence" is already computable
locally — it is exactly what `shouldPreemptivelySuppress` computes.

Snapshot freshness today: refreshed on mount, on `chrome.storage.onChanged`
for the `monocle-settings` key, and after any non-success response from
`execute-keybinding`. That last refresh path dies if we stop sending messages
for unknown keys — the storage listener still covers settings edits, but
**site SDK registrations do not write `monocle-settings`** and can add
bindings at runtime. Step 3 closes that hole.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                       | exit 0              |
| Tests     | `pnpm test`                          | all pass            |
| Format    | `pnpm run fmt:check`                 | exit 0              |
| Build     | `pnpm run build`                     | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `shared/hooks/useGlobalKeybindings.tsx`
- `shared/hooks/useGlobalKeybindings.test.ts` (create)
- `content/components/ContentCommandPalette.tsx` — only if wiring the site
  SDK refresh requires passing a subscription into the hook (Step 3).

**Out of scope** (do NOT touch):
- `shared/utils/robust-key-capture.ts` — the capture mechanics, dual
  listeners, and WeakSet dedup are not this plan.
- `background/messages/executeKeybinding.ts` and the background sequence
  model — unchanged; the gate must be transparent to it.
- `shared/utils/event-filter.ts`, `key-normalizer.ts`.

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/003-gate-keystroke-messages`,
  message `perf: only message background for known keybindings`.

## Steps

### Step 1: Extract the shared predicate

In `useGlobalKeybindings.tsx`, lift the body of `shouldPreemptivelySuppress`
into a `matchesKnownBinding = useCallback((keyString: string): boolean => ...)`
that returns true when the key is an exact binding, a known sequence prefix,
or extends the current `localSequenceRef` into a known sequence (the existing
logic, verbatim). Use it in `shouldPreemptivelySuppress`.

**Verify**: `pnpm run tsc` → exit 0; behavior unchanged (`pnpm test` → pass)

### Step 2: Gate the message in onKeyPress

At the top of `onKeyPress`, after the `isCapturing` check, add:

```tsx
if (!matchesKnownBinding(keyString)) {
  return false
}
```

`return false` is the existing "not handled, let the browser have it" path.
Everything downstream (send, pending handling, local sequence updates) stays
as is. Subtle case to preserve: when a local sequence is in progress and the
user presses a key that does NOT continue it (e.g. `g` then `x`), today the
background receives `x`, fails the sequence, and the response path resets
local state. With the gate, `x` is never sent — so when
`matchesKnownBinding` returns false **while `localSequenceRef.current` is
non-empty**, call `resetLocalSequence()` before returning false. (The
background's own sequence state for the scope still times out via its 800ms
chord timer — that is the background's existing design for abandoned
sequences; do not add a cancel message.)

**Verify**: `pnpm run tsc` → exit 0

### Step 3: Keep the snapshot fresh for site SDK bindings

`content/siteSdkFacade.ts` / the content bridge exposes
`subscribeSiteSdkCommandsChanged` (see its import in
`content/components/ContentCommandPalette.tsx`). In `ContentCommandPalette`,
the existing subscription calls `fetchCommands()`. The hook needs the same
signal. Simplest wiring that respects the current layering: have
`useGlobalKeybindings` accept an optional `onSubscribeRefresh?: (refresh: () => void) => (() => void) | void`
in its options — the palette passes
`(refresh) => subscribeSiteSdkCommandsChanged(refresh)` — and the hook calls
it in an effect with `refreshKeybindingState`. If the hook can import
`subscribeSiteSdkCommandsChanged` directly without creating a
shared→content dependency (check the import path — if it lives under
`content/`, it must NOT be imported from `shared/`), prefer the option-
injection form described above.

**Verify**: `pnpm run tsc` → exit 0, and `grep -rn "from \"../../content" shared/` → no matches (no layering violation)

### Step 4: Tests

See test plan.

**Verify**: `pnpm test` → all pass

## Test plan

Create `shared/hooks/useGlobalKeybindings.test.ts`. The vitest environment is
`node` (`vitest.config.ts`), so do NOT render the hook with React — test the
gate logic by extracting it, or test at the integration seam:

Preferred shape: extract the pure predicate into an exported helper in the
same file (e.g. `export const computeKeybindingMatch = (key, exact: Set, prefixes: Set, localSequence: string[]) => ...`)
and unit-test that:

1. Exact binding matches (`<cmd-shift-k>` in exact set → true).
2. Sequence prefix matches (`g` in prefixes → true).
3. Continuation matches (`localSequence=["g"]`, prefixes has `g`, exact has
   `g, g`, key `g` → true).
4. Unbound key → false (`x`, empty local sequence).
5. Unbound key during a sequence → false (and the hook resets local
   sequence — assert via the hook-level test below if feasible, otherwise
   document as manual check).

If plan 006 (UI test baseline) has landed, additionally write a jsdom test
that renders a component using the hook, dispatches keydown events, and
asserts `sendMessage` is called only for bound keys. If 006 has not landed,
note it in the README status row as a follow-up.

Manual regression checks (required — keybinding capture is listed in
CLAUDE.md as needing manual verification):
- In `pnpm run dev:chrome`: a single-stroke binding still fires; a
  two-stroke sequence (`g, g` style from the vim template) still fires; an
  unbound key (`x`) on a normal page produces NO `execute-keybinding`
  message (observe the background service-worker console); typing in an
  input is untouched; the palette-open binding still works on a fresh tab
  after 40s of idle.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0, including new predicate tests
- [ ] `grep -n "matchesKnownBinding" shared/hooks/useGlobalKeybindings.tsx` shows the gate inside `onKeyPress`
- [ ] No import from `content/` inside `shared/` (`grep -rn "\"\\.\\./\\.\\./content" shared/ → no matches`)
- [ ] `pnpm run build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, noting manual checks performed

## STOP conditions

Stop and report back (do not improvise) if:

- The `onKeyPress` / `shouldPreemptivelySuppress` structure in the hook no
  longer matches the excerpts (in-flight work moved on).
- You find a background-side feature that relies on receiving *unbound*
  keystrokes (search `background/messages/executeKeybinding.ts` for any
  handling of non-matching keys beyond returning failure — there should be
  none).
- `get-keybinding-state` turns out not to include site-SDK-registered
  bindings (check `background/messages/getKeybindingState.ts`); the gate
  would then permanently hide those bindings — report instead of shipping.
- Wiring Step 3 requires more than ~20 lines or a new message type.

## Maintenance notes

- The local snapshot is now load-bearing for correctness (a stale snapshot
  means a binding silently doesn't fire). Any new source of keybindings
  (e.g. future website-command plugins) MUST trigger `get-keybinding-state`
  refresh — via a settings write or the site-SDK-changed subscription.
- Reviewer should scrutinize the sequence-abandonment path (Step 2's
  `resetLocalSequence` on non-continuation) against the background's chord
  timeout semantics.
- Follow-up deferred: the background keybinding registry rebuild on first
  message after worker restart still exists; it just fires far less often
  now. A `chrome.storage.session` registry cache was audited as a separate
  improvement (see plans/README.md backlog).
