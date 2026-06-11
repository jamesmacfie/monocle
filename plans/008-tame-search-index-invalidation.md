# Plan 008: Stop ordinary browsing from destroying the search index

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- background/commands/searchIndex.ts background/commands/searchIndex.test.ts`
> If changed, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

The background search index — the thing that makes per-keystroke palette
search fast — is invalidated by `tabs.onCreated`, `tabs.onRemoved`,
`tabs.onUpdated`, and `tabs.onActivated`, all unconditionally.
`tabs.onUpdated` fires several times per page load (loading → complete,
title, favicon); `onActivated` fires on every tab switch. In practice the
cache almost never survives normal browsing, so the "first keystroke after
doing anything" pays a full index rebuild: re-fetching children for every
deep-search group (bookmarks tree, history, open tabs, recently closed via
chrome APIs), resolving async names/keywords/descriptions per entry, and
tokenizing everything. The TTL and inflight machinery are well built — the
invalidation just defeats them.

Two changes fix this without weakening freshness where it matters:
**(a)** only invalidate on tab events that change index content, and
**(b)** serve the previous (stale) index for the query that arrives while a
rebuild is in flight, instead of blocking the user's keystroke on the
rebuild (stale-while-revalidate). A third micro-fix rides along: the build
does an O(favorites) array scan per entry.

## Current state

File: `background/commands/searchIndex.ts` (734 lines). Key regions, as of
planning:

Cache + TTL + inflight (lines 541–589) — works correctly:

```ts
export const getSearchIndex = async (context?, options?) => {
  const contextKey = getContextKey(context, options)
  if (cachedIndex && cachedIndex.contextKey === contextKey &&
      Date.now() - cachedIndex.builtAt < INDEX_TTL_MS) {
    return cachedIndex
  }
  if (inflightBuild && inflightBuild.contextKey === contextKey) {
    return await inflightBuild.promise
  }
  const promise = (async (): Promise<SearchIndex> => {
    const { entries, commandSettings } = await buildSearchIndex(context, options)
    const index: SearchIndex = { entries, builtAt: Date.now(), contextKey, commandSettings }
    cachedIndex = index
    return index
  })()
  inflightBuild = { contextKey, promise }
  try { return await promise } finally {
    if (inflightBuild?.promise === promise) inflightBuild = null
  }
}

export const invalidateSearchIndex = (): void => {
  cachedIndex = null
  inflightBuild = null
  visibleCache = null
}
```

The indiscriminate invalidation wiring (lines 689–726, abridged):

```ts
export const initializeSearchIndexInvalidation = (): void => {
  const api = getBrowserAPI()
  const invalidate = () => invalidateSearchIndex()

  api.tabs?.onCreated?.addListener(invalidate)
  api.tabs?.onRemoved?.addListener(invalidate)
  api.tabs?.onUpdated?.addListener(invalidate)
  api.tabs?.onActivated?.addListener(invalidate)
  api.history?.onVisited?.addListener(invalidate)
  api.history?.onVisitRemoved?.addListener(invalidate)
  api.bookmarks?.onCreated?.addListener(invalidate)
  // ... bookmarks onRemoved/onChanged/onMoved, sessions.onChanged,
  // permissions onAdded/onRemoved, storage.onChanged (filtered by key) ...
}
```

The per-entry favorites scan during build (`createEntry`, line 214, and the
nested-favorite check in `walkGroups`, line 328):

```ts
    isFavorite: shared.favoriteCommandIds.includes(command.id),
```
```ts
        } else if (shared.favoriteCommandIds.includes(child.id)) {
```

`BuildShared` (lines 173–178) declares `favoriteCommandIds: string[]`.
`walkGroups` also reads `shared.favoriteCommandIds.length > 0` (line 232) as
a "skip subtrees with no favorites" guard — a Set's `.size` serves the same
purpose.

What the index actually contains (so invalidation relevance can be judged):
entries for root commands plus deep-search-flattened action/submit children
of groups with `enableDeepSearch` (open tabs, history, bookmarks, recently
closed, etc.), with match text (name/keywords/description) resolved at build
time. Display names shown to the user are re-resolved at suggestion time in
`commandsToSuggestions`, so index staleness affects *match text and entry
membership only*, never displayed labels.

Existing tests: `background/commands/searchIndex.test.ts` — read it before
changing anything; it covers build/invalidate behavior and is the pattern
for new tests.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                       | exit 0              |
| Tests     | `pnpm test`                                          | all pass            |
| Focused   | `pnpm test -- background/commands/searchIndex.test.ts` | all pass          |
| Format    | `pnpm run fmt:check`                                 | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `background/commands/searchIndex.ts`
- `background/commands/searchIndex.test.ts`

**Out of scope** (do NOT touch):
- `background/messages/searchCommands.ts` — the narrowing cache there keys on
  array identity of `getVisibleEntries` output and self-corrects on any index
  rebuild; it needs no changes for SWR (a stale index is still a consistent
  array identity).
- Persisting the index to `chrome.storage.session` (cold-start cache) —
  separate backlog item, bigger risk surface.
- `background/commands/index.ts`, `query.ts` — other plans touch these.
- Partial/per-source index rebuilds — explicitly rejected for now (high
  complexity; revisit only if this plan's win is insufficient).

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/008-index-invalidation`, message
  `perf: scope tab-event index invalidation and serve stale index during rebuild`.

## Steps

### Step 1: Make tab-event invalidation discriminate

In `initializeSearchIndexInvalidation`:

1. `tabs.onUpdated`: replace the bare `invalidate` with a handler that only
   invalidates when the change can affect index content:

```ts
api.tabs?.onUpdated?.addListener(
  (_tabId: number, changeInfo: { url?: string; title?: string }) => {
    if (changeInfo.url !== undefined || changeInfo.title !== undefined) {
      invalidate()
    }
  },
)
```

   (Tab entries in the index match on tab title/URL; favicon and loading
   status don't participate in match text.)
2. `tabs.onActivated`: remove the listener entirely, with a comment:
   switching tabs changes neither the set of tabs nor their titles, so index
   *content* is unaffected; per-URL visibility is applied at query time by
   `getVisibleEntries`, not baked into the index. **Verify the premise
   first**: `grep -rn "enableDeepSearch" background/commands/` and inspect
   each deep-search group's `children()` — if any child list or child name
   depends on *which tab is active* (not just which tabs exist), keep the
   listener and note why. (`tabActivationHistory`-based commands are
   action-type root commands, not deep-search children — they don't index
   per-tab entries.)
3. Keep `onCreated`/`onRemoved` as-is (they genuinely change the tab-entry
   set, and fire at human frequency).

**Verify**: `pnpm test -- background/commands/searchIndex.test.ts` → pass

### Step 2: Stale-while-revalidate in getSearchIndex

1. Add module state `let staleIndex: SearchIndex | null = null`.
2. In `invalidateSearchIndex`, before nulling: `staleIndex = cachedIndex ?? staleIndex`.
   Keep clearing `cachedIndex`, `inflightBuild`, `visibleCache` as today.
3. In `getSearchIndex`, when there's a cache miss **and** no usable inflight
   build: start the rebuild exactly as today, but if
   `staleIndex && staleIndex.contextKey === contextKey`, return the stale
   index immediately instead of awaiting the rebuild (the rebuild promise
   keeps running and updates `cachedIndex` when done; attach a `.catch` that
   logs, mirroring `warmSearchIndex`'s error style at lines 730–734).
4. When a fresh build completes, also set `staleIndex = null` (don't serve
   ancient data after a successful rebuild) — do this inside the build
   promise after `cachedIndex = index`.
5. Add a hard staleness bound so SWR can't serve arbitrarily old data:
   only serve `staleIndex` if `Date.now() - staleIndex.builtAt < INDEX_TTL_MS * 4`
   (with `INDEX_TTL_MS` = 30s at planning time → 2-minute ceiling).
   Otherwise await the rebuild as today.
6. TTL expiry (cache present but older than TTL) should behave the same way:
   treat the expired `cachedIndex` as the stale candidate (assign it to
   `staleIndex` at that point) and return it while rebuilding.

Behavioral consequence to document in a comment: for at most one debounce
window after a tab/bookmark/history change, search results may include an
entry that just disappeared (e.g. a just-closed tab) or miss one that just
appeared. Executing a suggestion for a closed tab already fails gracefully
(suggestions held in the open palette UI can outlive their tabs today — this
is not a new failure mode).

**Verify**: `pnpm run tsc` → exit 0

### Step 3: Favorites as a Set in the build path

In `BuildShared` (lines 173–178), change `favoriteCommandIds: string[]` to
`favoriteCommandIds: ReadonlySet<string>`. Update:
- the two construction sites (in `buildSearchIndex` and
  `buildEphemeralIndexEntries`, which both load via `getFavoriteCommandIds()`
  — wrap in `new Set(...)`),
- `createEntry` line 214: `.includes(...)` → `.has(...)`,
- `walkGroups` line 328: `.includes(...)` → `.has(...)`,
- `walkGroups` line 232: `.length > 0` → `.size > 0`.

**Verify**: `pnpm run tsc` → exit 0 (the compiler finds any missed site)

### Step 4: Tests

See test plan.

**Verify**: `pnpm test` → all pass

## Test plan

Extend `background/commands/searchIndex.test.ts`, following its existing
fakeBrowser/mocking conventions:

1. **onUpdated filtering**: fire the registered onUpdated listener with
   `{ status: "loading" }` → index NOT invalidated (same index object
   returned); fire with `{ title: "New title" }` → invalidated.
   (The test needs access to the registered listener — the existing test
   file's approach to `initializeSearchIndexInvalidation` shows how; if it
   doesn't test listeners at all, capture them via the fakeBrowser/mock
   `addListener` spy.)
2. **No onActivated listener registered** (if Step 1.2's verification
   passed): assert `tabs.onActivated.addListener` was not called.
3. **SWR returns stale immediately**: build an index; invalidate; make the
   next build slow (mock a deep-search children() with a deferred promise);
   call `getSearchIndex` → resolves with the OLD index without waiting;
   after the deferred resolves, a subsequent call returns the NEW index.
4. **SWR staleness ceiling**: with fake timers, age the stale index past
   `INDEX_TTL_MS * 4` → `getSearchIndex` awaits the rebuild instead.
5. **Favorites Set behavior unchanged**: existing favorite-entry tests stay
   green (they prove `.has` semantics match `.includes`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0, including ≥4 new tests
- [ ] `grep -n "changeInfo" background/commands/searchIndex.ts` shows the filtered onUpdated handler
- [ ] `grep -n "staleIndex" background/commands/searchIndex.ts` shows SWR in `getSearchIndex` and `invalidateSearchIndex`
- [ ] `grep -n "favoriteCommandIds.includes" background/commands/searchIndex.ts` → no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The invalidation wiring or `getSearchIndex` no longer match the excerpts.
- Step 1.2's verification finds a deep-search child whose content depends on
  the active tab — keep the listener, do the rest, and report.
- The SWR change makes `searchCommands.test.ts` or `command-system.test.ts`
  fail in a way that isn't "test assumed invalidate→next-call-rebuilds-
  synchronously" (that specific assumption may need the test updated to
  await the background rebuild; anything else suggests a real semantics
  break — stop).
- You find `getContextKey` includes the page URL in the non-siteSdk case
  (it shouldn't, per the excerpt — if it does, SWR hit rates change and the
  design should be revisited).

## Maintenance notes

- SWR means "index freshness" is now eventually-consistent within one
  rebuild. Anyone adding a NEW invalidation source should ask whether
  one-query staleness is acceptable for it; for security-relevant
  visibility (URL allow/deny rules) it is NOT — but those are applied at
  query time via `getVisibleEntries`/settings, which this plan does not
  touch (settings-triggered invalidation still clears `visibleCache`
  synchronously, and `getVisibleEntries` reads `index.commandSettings` —
  note: a *stale* index also carries stale `commandSettings`. Settings
  changes invalidate via storage.onChanged; the stale index served during
  that rebuild would apply pre-change URL rules for one debounce window.
  Reviewers should confirm this is acceptable; if not, skip SWR when the
  invalidation came from a settings change — an easy refinement: pass a
  `reason` to `invalidateSearchIndex` and only retain `staleIndex` for
  tab/history/bookmark reasons).
- The known siteSdk caveat stands: on pages with site SDK commands the
  context key includes the URL and revision, so SDK-page navigation still
  misses the cache. Backlogged separately.
- Revisit partial rebuilds only if profiling after this plan still shows
  rebuild cost on interactive paths.
