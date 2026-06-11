# Plan 007: Cache the keybinding registry snapshot instead of rebuilding per message

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- background/keybindings/ background/messages/executeKeybinding.ts background/messages/getKeybindingState.ts`
> `background/keybindings/registry.ts` and `source.ts` had uncommitted
> modifications at planning time — compare the "Current state" excerpts
> against the live code regardless; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (plan 003 reduces how often this path fires; this plan makes each firing cheap — they compose, either order)
- **Category**: perf
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

Every `execute-keybinding` message — today, one per keystroke outside an
editable element on every page — calls `getKeybindingRegistrySnapshot`, which
has **no cache**: it re-reads all command settings from storage, re-loads and
re-filters the root command tree, recursively walks every deep-search group
calling `command.children(context)` (live chrome bookmarks/history/tabs
queries) plus `checkPermissions` per group, and runs a recursive
`resolveCommandById` tree-walk for every custom-bound command. A failed
two-stroke sequence does this **three times in one message** (initial
evaluation, continuation evaluation, single-stroke fallback). The
`get-keybinding-state` message does the same full rebuild, and the UI calls it
on every palette mount and on every `monocle-settings` storage change *in
every open tab* — one settings write with 30 tabs open = 30 full rebuilds.

The registry's inputs (command tree, settings, granted permissions, site SDK
revision) change rarely and all have observable change events. A
context-keyed cache with event invalidation plus a TTL backstop turns the
per-keystroke cost into a Map lookup.

## Current state

Relevant files:

- `background/keybindings/registry.ts` (~180 lines, modified-uncommitted) —
  `getKeybindingRegistrySnapshot` (lines 69–79) builds from scratch every
  call. A separate module-level `keybindingRegistry` Map exists (line 22),
  populated by `initializeKeybindingRegistry`/`refreshKeybindingRegistry`
  (lines 151–181), but the snapshot path does NOT use it.
- `background/keybindings/source.ts` (~195 lines) —
  `loadKeybindingCommandEntries` (lines 167–194): reads
  `getAllCommandSettings()`, calls `getFilteredRootCommands`, then
  `collectDeepSearchEntries` (children() + permission checks per deep-search
  group, recursive) and `collectCustomSettingEntries` (per custom binding:
  `resolveCommandById`, itself a recursive tree walk that re-reads settings —
  see `background/commands/query.ts:421-435` region).
- `background/messages/executeKeybinding.ts` — `loadKeybindingSnapshot`
  (lines 163–169) calls `getKeybindingRegistrySnapshot` per message;
  `evaluateSequence` (lines 217–234) reloads the snapshot whenever its
  `snapshot` parameter is not passed — and the two calls at lines ~320 and
  ~333 do not pass it.
- `background/messages/getKeybindingState.ts` (~30 lines) — same full
  rebuild per call.
- `background/commands/searchIndex.ts` — the established cache pattern to
  copy: `cachedIndex` + `inflightBuild` + `getContextKey` (lines 103–135)
  and TTL check in `getSearchIndex` (lines 541–583).
- Invalidation triggers that already exist: `refreshKeybindingRegistry()` is
  called after settings mutations (grep its call sites:
  `background/messages/updateCommandKeybindings.ts`,
  `background/commands/index.ts` generated-action paths — re-derive the full
  list with `grep -rn "refreshKeybindingRegistry" background/`).

Excerpt — `background/keybindings/registry.ts:69-79` (the uncached hot path):

```ts
export async function getKeybindingRegistrySnapshot(
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<KeybindingRegistrySnapshot> {
  const bindings = await buildRegistry(context, options)

  return {
    bindings,
    sequencePrefixes: createSequencePrefixes(bindings.keys()),
  }
}
```

Excerpt — `background/keybindings/source.ts:167-194` (what one build costs):

```ts
export const loadKeybindingCommandEntries = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<KeybindingCommandEntry[]> => {
  const normalizedContext = normalizeContext(context)
  const commandSettings = await getAllCommandSettings()
  const rootCommands = await getFilteredRootCommands(normalizedContext, options)
  const entries: KeybindingCommandEntry[] = []
  const seenEntries = new Set<string>()

  await collectDeepSearchEntries(
    rootCommands, normalizedContext, commandSettings, entries, seenEntries,
  )
  await collectCustomSettingEntries(
    normalizedContext, options, commandSettings, entries, seenEntries,
  )
  return entries
}
```

Excerpt — `background/messages/executeKeybinding.ts:217-234` (snapshot
reloaded for continuation strokes):

```ts
const evaluateSequence = async (
  scopeKey: string,
  state: SequenceState,
  context: Browser.Context,
  sender?: any,
  snapshot?: KeybindingRegistrySnapshot,
) => {
  const currentSnapshot =
    snapshot ?? (await loadKeybindingSnapshot(context, sender))
  ...
```

The cache-key precedent — `background/commands/searchIndex.ts:127-135`:

```ts
const getContextKey = (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): string => {
  const siteSdkKey = options?.siteSdk
    ? `|site:${options.siteSdk.scopeKey}:${options.siteSdk.revision}:${context?.url ?? ""}`
    : ""
  return `${context?.isNewTab ? "newtab" : "page"}|${getPlatform(options)}${siteSdkKey}`
}
```

Important nuance: registry content can depend on `context.url` even without
site SDK, because `collectDeepSearchEntries` URL-filters children
(`filterCommandsByUrl(children, context.url || "", ...)`). The cache key must
therefore include the URL (unlike the search index, which applies URL
filtering at query time). Per-URL caching still wins: repeated keystrokes on
the same page hit the cache.

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                                | exit 0              |
| Tests     | `pnpm test`                                                   | all pass            |
| Focused   | `pnpm test -- background/keybindings/registry.test.ts background/messages/sequence-keybinding.test.ts` | all pass |
| Format    | `pnpm run fmt:check`                                          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `background/keybindings/registry.ts`
- `background/keybindings/registry.test.ts` (extend)
- `background/messages/executeKeybinding.ts` (only the two `evaluateSequence`
  call sites, to thread the snapshot)
- `background/index.ts` (only if wiring an invalidation listener requires a
  one-line init call)

**Out of scope** (do NOT touch):
- `background/keybindings/source.ts` — reducing the cost of a single build
  (settings threading, command-id index) is a separate backlog item; this
  plan reduces build *frequency*.
- `background/messages/getKeybindingState.ts` — it benefits automatically
  via the cached `getKeybindingRegistrySnapshot`; no changes needed.
- `background/commands/searchIndex.ts` — pattern donor only.
- The sequence-state model in `executeKeybinding.ts` (timers, scopes).

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/007-keybinding-snapshot-cache`,
  message `perf: cache keybinding registry snapshot per context`.

## Steps

### Step 1: Add the snapshot cache to registry.ts

Mirror the searchIndex pattern:

1. Add a key builder. `getPlatform` and the siteSdk fields come from
   `CommandLoadOptions` — check how `searchIndex.ts` imports `getPlatform`
   (`background/commands/platform.ts`) and match it:

```ts
const getSnapshotKey = (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): string => {
  const siteSdkKey = options?.siteSdk
    ? `|site:${options.siteSdk.scopeKey}:${options.siteSdk.revision}`
    : ""
  return `${context?.isNewTab ? "newtab" : "page"}|${context?.url ?? ""}|${getPlatform(options)}${siteSdkKey}`
}
```

2. Add module state: a small Map cache with TTL and an inflight guard:

```ts
const SNAPSHOT_TTL_MS = 30_000
const MAX_CACHED_SNAPSHOTS = 8
const snapshotCache = new Map<
  string,
  { snapshot: KeybindingRegistrySnapshot; builtAt: number }
>()
const inflightSnapshots = new Map<string, Promise<KeybindingRegistrySnapshot>>()
```

3. Rework `getKeybindingRegistrySnapshot`: on cache hit within TTL, return
   it; on inflight hit, await it; otherwise build, store (evicting the
   oldest entry when size exceeds `MAX_CACHED_SNAPSHOTS` — insertion order
   of a Map is fine, no LRU needed), and clear the inflight entry in a
   `finally`. Copy the inflight-guard shape from
   `searchIndex.ts:555-582`.
4. Add and export `invalidateKeybindingSnapshots(): void` that clears both
   maps. Call it at the top of `initializeKeybindingRegistry` (which
   `refreshKeybindingRegistry` delegates to), so every existing
   refresh call site invalidates the cache with no further changes.

**Verify**: `pnpm run tsc` → exit 0; `pnpm test -- background/keybindings` → pass

### Step 2: Wire event invalidation for inputs not covered by refresh calls

`refreshKeybindingRegistry()` covers settings mutations made through the
app's own code paths. Two inputs change outside those paths:

- **Granted permissions** (a permission grant can reveal deep-search groups):
  add `permissions.onAdded`/`onRemoved` listeners.
- **Settings written by another surface** (options page in another context,
  or future sync): add a `storage.onChanged` listener for `monocle-settings`
  in the `local` area.

Add an exported `initializeKeybindingSnapshotInvalidation(): void` in
`registry.ts` that registers these (existence-guard every API with `?.` —
copy the style of `initializeSearchIndexInvalidation` in
`searchIndex.ts:689-726`, including the Firefox guards). Call it from
`initializeBackground` in `background/index.ts`, adjacent to the existing
`initializeSearchIndexInvalidation()` call. Listener registration must be
synchronous at top level of the init path (MV3 requirement) — match how the
search-index one is called.

Do NOT add tab-event invalidation. Rationale (record it as a comment):
tab-derived dynamic children effectively never carry keybindings (repo
convention per CLAUDE.md: dynamic ids "usually disable custom keybindings"),
and the 30s TTL bounds any residual staleness. **Before relying on this,
verify it**: `grep -rln "enableDeepSearch" background/commands/` and check
each listed group's children for `keybinding` fields on dynamically-generated
children (tabs, history entries, bookmarks). If you find a dynamic child
*with* a default keybinding, STOP and report.

**Verify**: `pnpm run tsc` → exit 0

### Step 3: Thread the snapshot through continuation strokes

In `background/messages/executeKeybinding.ts`, the continuation path
(`handleExecuteKeybinding`, the branch after line ~310) calls
`evaluateSequence` twice without a snapshot (lines ~320 and ~333). Load it
once at the top of that branch with the existing
`loadKeybindingSnapshot(message.context, sender)` and pass it to both calls.
With the cache from Step 1 this is belt-and-braces (the reload would be a
cache hit), but it also makes the two evaluations of one message consistent
even if the cache is invalidated mid-message.

**Verify**: `pnpm test -- background/messages/sequence-keybinding.test.ts` → all pass

### Step 4: Tests

See test plan.

**Verify**: `pnpm test` → all pass

## Test plan

Extend `background/keybindings/registry.test.ts` (follow its existing
mocking conventions; it already exercises `getKeybindingRegistrySnapshot`):

1. **Cache hit**: two consecutive `getKeybindingRegistrySnapshot` calls with
   the same context → the underlying `loadKeybindingCommandEntries` work runs
   once. Easiest signal: mock or spy on a function the build path calls
   (e.g. `vi.spyOn` the settings module's `getAllCommandSettings`) and assert
   one call. If the existing test setup makes spying awkward, assert
   reference equality of the two returned snapshots instead.
2. **Different context = different cache entry**: `{ url: "https://a.com" }`
   vs `{ url: "https://b.com" }` → two builds.
3. **Invalidation**: snapshot → `refreshKeybindingRegistry()` → snapshot →
   two builds (and the second reflects changed mock settings).
4. **TTL expiry**: with `vi.useFakeTimers`, advance past 30s → rebuild.
   (`Date.now` is used by the searchIndex TTL; use the same time-control
   approach as `background/commands/searchIndex.test.ts` if it has one —
   check it first.)
5. **Existing suites stay green** — especially
   `sequence-keybinding.test.ts` and `container-keybinding.test.ts`; if any
   test mutates settings mid-test and expects the next snapshot to see it,
   it must now go through `refreshKeybindingRegistry()` — fixing the *test*
   to do what production code does is acceptable; weakening assertions is
   not.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0, including ≥3 new cache tests
- [ ] `grep -n "snapshotCache" background/keybindings/registry.ts` shows the cache consulted in `getKeybindingRegistrySnapshot`
- [ ] `grep -n "evaluateSequence(" background/messages/executeKeybinding.ts` shows a snapshot argument at every call site
- [ ] `grep -rn "initializeKeybindingSnapshotInvalidation" background/index.ts` → one call
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `getKeybindingRegistrySnapshot` or `loadKeybindingCommandEntries` no longer
  match the excerpts (the in-flight keybinding work moved on).
- The deep-search verification in Step 2 finds dynamically-generated children
  with default keybindings (the no-tab-invalidation rationale collapses).
- More than 2 existing tests need changes beyond routing settings mutations
  through `refreshKeybindingRegistry()` — the cache semantics may be wrong.
- You're tempted to also cache inside `source.ts` — that's explicitly out of
  scope; report the temptation as a follow-up note instead.

## Maintenance notes

- Anything that changes which commands exist or their keybindings MUST call
  `refreshKeybindingRegistry()` (existing convention, now load-bearing for
  the cache too) — reviewers should check this on new mutation paths.
- The reviewer should scrutinize the cache key: if a new context field starts
  affecting registry content (like a future per-container context), it must
  join `getSnapshotKey`.
- Deferred follow-ups (backlogged in plans/README.md): thread
  `commandSettings` through one build to remove the 3+ redundant settings
  reads per rebuild; replace the per-custom-binding `resolveCommandById`
  tree-walks with a command-id→node index; persist the snapshot to
  `chrome.storage.session` to also cover the cold path after worker restart.
