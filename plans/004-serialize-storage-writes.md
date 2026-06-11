# Plan 004: Serialize read-modify-write cycles on chrome.storage.local

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- background/commands/favorites.ts background/commands/usage.ts background/commands/settings.ts background/utils/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`background/commands/settings.ts`
> had uncommitted modifications at planning time — compare excerpts
> regardless.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (see overlap note with plan 005 in Maintenance notes)
- **Category**: bug
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

Every persistent-state mutation in the background follows the same unguarded
pattern: `load from chrome.storage.local` → `mutate in memory` → `save`.
Background message handlers are async and interleave at every `await`, and
messages arrive concurrently from multiple tabs (every command execution
records usage; favorites toggle from any palette; settings writes from the
options page). Two interleaved cycles on the same key silently lose one
write: a favorites toggle vanishes, a usage increment disappears (degrading
search ranking over time), or — worst — a settings write from the options
page overwrites a concurrent settings write from a palette action, dropping
a keybinding or URL rule the user just saved. The `monocle-settings` blob is
shared by ~10 read-modify-write call sites, so it has the widest window.

A single per-key async mutex (a promise chain) closes all of these at once.

## Current state

Relevant files:

- `background/commands/favorites.ts` — favorites list under its own storage
  key. `toggleFavoriteCommandId` (lines 60–73) is a *double* RMW: it loads
  to decide, then `addToFavoriteCommandIds`/`removeFromFavoriteCommandIds`
  (lines 37–57) each load again and save.
- `background/commands/usage.ts` — `recordCommandUsage` (lines 123–159):
  `loadUsageData()` → mutate stats → `saveUsageData(usageData)`.
- `background/commands/settings.ts` — private `loadSettings` (line 84) and
  `saveSettings` (line 108); ~10 exported functions follow load→mutate→save
  on the same `monocle-settings` key (e.g. `updateCommandSettings` at
  line 150, `updateCommandKeybindings` at line 172, plus the functions at
  lines 211, 224, 249, 257, 266, 279, 287, 296).
- `background/utils/` — where shared background utilities live; the new
  mutex goes here.

Excerpt — `background/commands/favorites.ts:60-73`:

```ts
export const toggleFavoriteCommandId = async (
  commandId: string,
): Promise<boolean> => {
  const favoriteCommandIds = await loadFavoriteCommandIds()
  const isFavorite = favoriteCommandIds.includes(commandId)

  if (isFavorite) {
    await removeFromFavoriteCommandIds(commandId)
    return false
  } else {
    await addToFavoriteCommandIds(commandId)
    return true
  }
}
```

Excerpt — `background/commands/usage.ts:123-158` (abridged):

```ts
export const recordCommandUsage = async (commandId, parentNames?) => {
  const usageData = await loadUsageData()
  const stats = usageData.commandStats[commandId] || createEmptyStats(commandId)
  stats.totalUsage += 1
  // ... mutate hourlyUsage, emaScore, optional cleanup ...
  usageData.commandStats[commandId] = stats
  await saveUsageData(usageData)
}
```

Convention notes: plain exported async functions, no classes for utilities is
fine but small classes exist elsewhere; prefer a plain module. The repo's
PostToolUse hook runs tsc + biome and strips unused imports.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                 | exit 0              |
| Tests     | `pnpm test`                                    | all pass            |
| Focused   | `pnpm test -- background/commands/settings.test.ts` | all pass       |
| Format    | `pnpm run fmt:check`                           | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `background/utils/storageMutex.ts` (create)
- `background/utils/storageMutex.test.ts` (create)
- `background/commands/favorites.ts`
- `background/commands/usage.ts`
- `background/commands/settings.ts`

**Out of scope** (do NOT touch):
- Read-only paths (`getAllCommandSettings`, `getFavoriteCommandIds`,
  `getCommandUsageStats`, `getSettings`) — reads stay lock-free.
- `background/commands/searchIndex.ts` invalidation listeners — they react to
  storage events and are unaffected.
- UI slices that mirror settings — unchanged message contracts.
- Cross-worker atomicity: the mutex serializes within one service-worker
  instance, which is the only writer; do NOT attempt storage-level
  versioning/CAS.

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/004-serialize-storage-writes`,
  message `fix: serialize storage read-modify-write cycles`.

## Steps

### Step 1: Create the per-key mutex

Create `background/utils/storageMutex.ts`:

```ts
const queues = new Map<string, Promise<unknown>>()

/**
 * Serializes async critical sections per key. All read-modify-write cycles
 * against the same storage key must run inside withStorageLock(key, ...) so
 * concurrent message handlers cannot interleave between load and save.
 * Reads outside a critical section remain lock-free.
 */
export const withStorageLock = async <T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.then(fn, fn) // run regardless of predecessor outcome
  // Park the chain on a settled promise so one failure doesn't poison the queue
  queues.set(key, run.catch(() => undefined))
  void run.finally(() => {
    if (queues.get(key) === run.catch(() => undefined)) queues.delete(key)
  })
  return run
}
```

Note on the cleanup line: `run.catch(...)` creates a new promise each call, so
the identity check above will never match — implement cleanup correctly by
storing the parked promise in a variable first:

```ts
const parked = run.then(
  () => undefined,
  () => undefined,
)
queues.set(key, parked)
void parked.then(() => {
  if (queues.get(key) === parked) queues.delete(key)
})
```

Use exactly this shape (store `parked`, compare `parked`).

**Verify**: `pnpm run tsc` → exit 0

### Step 2: Wrap the favorites write paths

In `background/commands/favorites.ts`, find the storage key constant used by
`loadFavoriteCommandIds`/`saveFavoriteCommandIds` (top of file). Then:

- Rewrite `toggleFavoriteCommandId` to do the whole decide-and-write inside
  one lock (eliminating the double-load):

```ts
export const toggleFavoriteCommandId = async (
  commandId: string,
): Promise<boolean> =>
  withStorageLock(FAVORITES_STORAGE_KEY, async () => {
    const ids = await loadFavoriteCommandIds()
    const index = ids.indexOf(commandId)
    if (index !== -1) {
      ids.splice(index, 1)
      await saveFavoriteCommandIds(ids)
      return false
    }
    ids.push(commandId)
    await saveFavoriteCommandIds(ids)
    return true
  })
```

- Wrap the bodies of `addToFavoriteCommandIds` and
  `removeFromFavoriteCommandIds` in the same lock (they are exported and may
  have other callers — check with
  `grep -rn "addToFavoriteCommandIds\|removeFromFavoriteCommandIds" background/`
  and keep their signatures). Re-entrancy warning: the rewritten toggle must
  NOT call the wrapped add/remove from inside its own lock (that deadlocks a
  promise-chain mutex) — hence the inline splice/push above.

**Verify**: `pnpm test -- background/commands` → all pass

### Step 3: Wrap usage recording

In `background/commands/usage.ts`, wrap the body of `recordCommandUsage` in
`withStorageLock(<usage storage key constant>, async () => { ... })`. Find
the key constant used by `loadUsageData`/`saveUsageData` at the top of the
file. Other usage functions are read-only — leave them.

**Verify**: `pnpm run tsc` → exit 0

### Step 4: Wrap the settings write paths

In `background/commands/settings.ts`, every exported function that calls both
`loadSettings()` and `saveSettings()` gets its body wrapped in
`withStorageLock(SETTINGS_STORAGE_KEY, ...)` (the key constant already exists
near the top — it stores under `monocle-settings`). At planning time those
were the functions containing lines 139–146, 150–169, 172–194, 211–215,
224–244, 249–259, 266–274, 279–289, 296–301 — enumerate them by grepping
`saveSettings(` and wrap each enclosing exported function.

Re-entrancy check (CRITICAL): `grep -n "updateCommandSettings\|saveSettings"
background/commands/settings.ts` and verify no wrapped function calls another
wrapped function *internally* (e.g. line ~202 calls `updateCommandSettings`
from another exported helper). If one does, refactor so the lock is taken
once: extract an unlocked `_updateCommandSettingsUnlocked` used by both, with
the lock only at the exported boundary.

**Verify**: `pnpm test -- background/commands/settings.test.ts` → all pass
(these tests exercise merge/prune semantics and must be green unchanged)

### Step 5: Tests

See test plan.

**Verify**: `pnpm test` → all pass

## Test plan

Create `background/utils/storageMutex.test.ts` (pattern: any small util test,
e.g. `background/utils/validation.test.ts` for structure):

1. **Serialization**: two `withStorageLock("k", ...)` calls where the first
   awaits a deferred — assert the second's fn does not start until the first
   resolves (record start order in an array).
2. **Independent keys run concurrently**: locks on `"a"` and `"b"` both start
   before either finishes.
3. **Failure doesn't poison the queue**: first fn rejects; second fn still
   runs; the first's rejection propagates to its caller.
4. **Return value passthrough**: resolves with fn's value.

Add a race regression test in `background/commands/settings.test.ts`
(following its existing mock-storage setup): fire two concurrent
`updateCommandSettings` calls for two different command ids whose mock
storage `get` resolves on a delay — assert the final saved settings contain
BOTH commands' updates. (Before this plan, that test fails: last write wins.)

Add one for favorites: two concurrent `toggleFavoriteCommandId` for two
different ids → both present afterwards.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0, including new mutex tests and the two concurrency
      regression tests
- [ ] Every function in `background/commands/settings.ts` that calls
      `saveSettings(` is inside a `withStorageLock` (spot-check:
      `grep -B5 "saveSettings(" background/commands/settings.ts | grep -c withStorageLock`
      ≥ number of `saveSettings(` call sites minus 1 for the definition)
- [ ] No deadlock: the full test suite completes without timeout
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `settings.ts` functions have been restructured since planning such that the
  line ranges above don't exist — re-derive the list via `saveSettings(`
  grep; if that's ambiguous, stop.
- You find a call path where a locked function invokes another locked
  function on the same key and the refactor to an unlocked inner helper
  would change an exported signature.
- Any existing test starts timing out after wrapping (suspect re-entrant
  deadlock — do not raise test timeouts to mask it).

## Maintenance notes

- New write paths to `monocle-settings`, favorites, or usage MUST go through
  `withStorageLock` — reviewers should reject naked load→save cycles. A
  one-line note in `CLAUDE.md`'s settings contract section would help (left
  to the maintainer; CLAUDE.md edits are out of scope here).
- Overlap with plan 005: 005 threads pre-loaded favorites/settings into
  read paths but touches none of the write cycles; the plans are
  order-independent, but if both are in flight simultaneously they touch
  `favorites.ts` — coordinate.
- Deliberately NOT done: storage-level versioning/CAS (only one writer — the
  background worker — exists; in-process serialization is sufficient and far
  simpler).
