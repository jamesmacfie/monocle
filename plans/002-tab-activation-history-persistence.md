# Plan 002: Make tab activation history survive MV3 service-worker restarts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `background/commands/browser/tabActivationHistory.ts`
> was an UNTRACKED file at planning time, so git diff won't show drift. Open
> the file and compare against the excerpt in "Current state". On a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

The in-flight "go to last active tab" command keeps its history in a
module-level array inside the MV3 background service worker. Chrome (and
Firefox MV3) terminate the worker after ~30 seconds of idle and restart it on
demand, wiping all module state. In practice: a user switches tabs, does
nothing for a minute, presses the "previous tab" keybinding — and nothing
happens, because the history is empty. This is the most common usage pattern
for this command (it's a recovery action, used after a pause), so the feature
silently fails exactly when it's wanted. `chrome.storage.session` exists for
precisely this state: in-memory, per-browser-session, survives worker
restarts, cleared on browser exit.

## Current state

Relevant files:

- `background/commands/browser/tabActivationHistory.ts` — the whole module
  (47 lines, untracked). Module-level `activatedTabIds: number[]` plus three
  exports.
- `background/index.ts` — wires the listeners at top level (synchronously,
  which is correct for MV3): `forgetActivatedTab(tabId)` in a
  `tabs.onRemoved` listener (~line 32), `recordActivatedTab(tabId)` in a
  `tabs.onActivated` listener (~line 40).
- `background/commands/browser/tabNavigationShortcuts.ts` — the only
  consumer: imports `getPreviousActivatedTabId` (line 11) and calls it with
  the active tab id (~line 124).
- `background/commands/favorites.ts` lines 8–12 — the repo's storage-access
  convention: `getBrowserAPI().storage.local.get(...)` wrapped in a small
  load function. Match this style, but with `storage.session`.

The module as it exists today (complete):

```ts
import { getTab } from "../../utils/browser"

const MAX_HISTORY_LENGTH = 50
const activatedTabIds: number[] = []

export function recordActivatedTab(tabId: number): void {
  const existingIndex = activatedTabIds.indexOf(tabId)
  if (existingIndex >= 0) {
    activatedTabIds.splice(existingIndex, 1)
  }

  activatedTabIds.push(tabId)

  if (activatedTabIds.length > MAX_HISTORY_LENGTH) {
    activatedTabIds.splice(0, activatedTabIds.length - MAX_HISTORY_LENGTH)
  }
}

export function forgetActivatedTab(tabId: number): void {
  const existingIndex = activatedTabIds.indexOf(tabId)
  if (existingIndex >= 0) {
    activatedTabIds.splice(existingIndex, 1)
  }
}

export async function getPreviousActivatedTabId(
  currentTabId?: number,
): Promise<number | undefined> {
  for (let index = activatedTabIds.length - 1; index >= 0; index -= 1) {
    const tabId = activatedTabIds[index]
    if (tabId === currentTabId) {
      continue
    }

    try {
      const tab = await getTab(tabId)
      if (tab?.id) {
        return tab.id
      }
    } catch (_error) {
      forgetActivatedTab(tabId)
    }
  }

  return undefined
}
```

Constraint that shapes the design: `recordActivatedTab` / `forgetActivatedTab`
are called from synchronous tab-event listeners in `background/index.ts`.
Keep their signatures **synchronous** (returning `void`) so `background/index.ts`
does not need to change. Use a write-through pattern: mutate the in-memory
array synchronously, then fire-and-forget the persistence write.

## Commands you will need

| Purpose   | Command                                                        | Expected on success |
|-----------|----------------------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                                 | exit 0              |
| Tests     | `pnpm test`                                                    | all pass            |
| One file  | `pnpm test -- background/commands/browser/tabActivationHistory.test.ts` | all pass |
| Format    | `pnpm run fmt:check`                                           | exit 0              |
| Build     | `pnpm run build` and `pnpm run build:firefox`                  | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `background/commands/browser/tabActivationHistory.ts`
- `background/commands/browser/tabActivationHistory.test.ts` (create)
- `background/index.ts` — ONLY if a one-line hydration call is needed at
  startup (see Step 2); no listener changes.

**Out of scope** (do NOT touch):
- `background/commands/browser/tabNavigationShortcuts.ts` — consumer API is
  unchanged (`getPreviousActivatedTabId` is already async).
- Other module-level background state (search index, sequence state, site SDK
  registry) — those are separate, deliberate trade-offs; do not "fix" them
  here.
- `wxt.config.ts` / manifest permissions — `storage` permission is already
  declared (storage.local is in active use); `storage.session` needs no
  additional permission.

## Git workflow

- The working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/002-tab-history-session`, message
  style `fix: persist tab activation history across worker restarts`.

## Steps

### Step 1: Add session-storage hydration and write-through persistence

Rework `tabActivationHistory.ts`:

1. Keep `activatedTabIds` as the in-memory working copy and keep all three
   exported function signatures exactly as they are.
2. Add a storage key constant: `const STORAGE_KEY = "monocle-tab-activation-history"`.
3. Add a private `persist()` that writes
   `{ [STORAGE_KEY]: [...activatedTabIds] }` to
   `getBrowserAPI().storage.session` — fire-and-forget with a `.catch()` that
   logs via `console.warn` (do not throw from the sync mutators). Import
   `getBrowserAPI` the same way `background/commands/favorites.ts` does.
4. Add a private `hydrate()`: reads the key from `storage.session`, and if the
   in-memory array is empty and the stored value is an array of numbers,
   splices it into `activatedTabIds`. Guard against malformed values
   (filter `typeof id === "number"`). Memoize with a module-level promise so
   concurrent callers hydrate once:
   `let hydrated: Promise<void> | null = null; const ensureHydrated = () => (hydrated ??= hydrate())`.
5. Call `persist()` at the end of `recordActivatedTab` and
   `forgetActivatedTab` (after the in-memory mutation).
6. In `getPreviousActivatedTabId`, `await ensureHydrated()` first — this is
   the path that runs after a worker restart, and it is already async.
7. In `recordActivatedTab`/`forgetActivatedTab`, also kick `ensureHydrated()`
   without awaiting (so a record event after restart doesn't clobber stored
   history with a single-element array). Ordering note: because `hydrate()`
   only fills the array when it is empty, and `persist()` snapshots the array
   at write time, the worst interleaving loses no more than pre-restart
   history that hydration would have restored — acceptable; do not build a
   queue for this.
8. One Firefox caveat: if `storage.session` is undefined on the running
   browser (old Firefox), degrade gracefully — `persist`/`hydrate` become
   no-ops. Check `getBrowserAPI().storage?.session` before use.

**Verify**: `pnpm run tsc` → exit 0

### Step 2: Confirm no startup hook is needed

Hydration is lazy (first `getPreviousActivatedTabId` call). Confirm
`background/index.ts` needs no change: the `onActivated`/`onRemoved`
listeners stay synchronous calls to the unchanged exports. Only if you find
the lazy approach insufficient (it isn't, per the design above) would a
`void ensureHydrated()` line be added to `initializeBackground` — prefer not.

**Verify**: `git diff background/index.ts` → empty (or one-line hydration kick only)

### Step 3: Tests

See test plan.

**Verify**: `pnpm test` → all pass

## Test plan

Create `background/commands/browser/tabActivationHistory.test.ts`. Pattern:
look at `background/messages/updateCommandKeybindings.test.ts` or
`background/commands/browser-commands.test.ts` for how the suite mocks the
browser API (the repo uses WXT's vitest plugin; `getBrowserAPI` is mockable
via `vi.mock` of `../../utils/browser` or by stubbing the global). Cases:

1. **record/forget/get round trip** (pure in-memory behavior): record 1, 2,
   3 → previous of 3 is 2; forget 2 → previous of 3 is 1.
2. **MRU + dedupe**: record 1, 2, 1 → order is [2, 1]; previous of 1 is 2.
3. **Cap**: record 60 distinct ids → length is 50, oldest dropped.
4. **Persistence write-through**: after `recordActivatedTab`,
   `storage.session.set` was called with the current array under
   `monocle-tab-activation-history`.
5. **Hydration**: with empty in-memory state and
   `storage.session.get` returning `[4, 5]`, `getPreviousActivatedTabId(5)`
   resolves to 4 (mock `getTab` to resolve `{ id: 4 }`).
6. **Missing storage.session**: stub `storage` without `session` → mutators
   don't throw, `getPreviousActivatedTabId` still works in-memory.
7. **Closed tab pruning** (existing behavior, keep green): `getTab` rejects
   for the newest id → it is skipped and forgotten, next id returned.

Note: tests share module state (`activatedTabIds`). Use `vi.resetModules()` +
dynamic `await import(...)` per test, or export a test-only reset — prefer
`vi.resetModules()`, matching vitest idioms already used in this repo.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0
- [ ] `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0, including the new `tabActivationHistory.test.ts`
- [ ] `grep -n "storage" background/commands/browser/tabActivationHistory.ts` shows session-storage use
- [ ] `recordActivatedTab` and `forgetActivatedTab` still return `void` (not `Promise`) — `grep -n "export function recordActivatedTab" background/commands/browser/tabActivationHistory.ts`
- [ ] `pnpm run build` and `pnpm run build:firefox` exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `tabActivationHistory.ts` no longer matches the excerpt (in-flight work
  moved on), or the file is gone/renamed.
- `getBrowserAPI()` does not expose `storage.session` in the type definitions
  and the cast required is more than a narrow local type guard.
- `background/index.ts` listener wiring has changed such that the mutators
  are now awaited (signatures may then change — but that's a different
  design; report back).

## Maintenance notes

- This establishes the repo's first `chrome.storage.session` use. The same
  pattern (sync in-memory + lazy hydrate + write-through) is the candidate
  fix for other restart-lossy background state (keybinding sequence state,
  site SDK registry snapshots) — see the audit notes in `plans/README.md`.
- Reviewer should check: hydration only fills an *empty* array (never merges),
  and persistence failures can't throw into tab-event listeners.
- Deferred: persisting/restoring across full browser restarts
  (`storage.local`) was deliberately rejected — tab ids are not stable across
  browser sessions.
