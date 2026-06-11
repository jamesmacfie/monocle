# Plan 005: Cut redundant work from the per-keystroke search path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8d89c2..HEAD -- background/utils/urlFilter.ts background/messages/searchCommands.ts background/commands/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`background/commands/index.ts` had
> uncommitted modifications at planning time — compare excerpts regardless.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (see overlap note with plan 004)
- **Category**: perf
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

Every palette keystroke (after a 200ms debounce) runs a background search
that does three kinds of avoidable work:

1. **Regex recompilation** — URL-rule patterns are recompiled with
   `patternToRegex()` on every visibility check, for every entry, on every
   query. Patterns are static strings; the compiled RegExp is a pure function
   of the pattern.
2. **Repeated storage reads** — result entries are converted to suggestions
   in batches grouped by permission set, and *each batch* re-reads favorites
   and the full settings blob from `chrome.storage.local` (its own code
   comment admits this: "each doing its own settings/favorites reads").
3. **O(n) favorite lookups** — `favoriteCommandIds.includes(node.id)` runs
   per command against an array.

None of these change behavior; all three are mechanical. Together they cut
per-keystroke I/O from N storage reads to 2 and remove hundreds of regex
compilations per query.

## Current state

Relevant files:

- `background/utils/urlFilter.ts` — `patternToRegex(pattern)` (function at
  line ~170, pure: pattern string in, RegExp out). Called from
  `matchesUrlPattern` (line ~198–214, the hot path) and from
  `validateUrlPattern` (line ~155).
- `background/messages/searchCommands.ts` — `entriesToSuggestions` (around
  lines 45–110) groups entries by permission set and calls
  `commandsToSuggestions` once per group.
- `background/commands/index.ts` — `commandsToSuggestions` (starts ~line 450)
  loads favorites + settings at the top of every invocation.

Excerpt — `background/utils/urlFilter.ts:198-214`:

```ts
export function matchesUrlPattern(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.trim()
    if (!normalizedPattern) {
      return false
    }
    try {
      const regex = patternToRegex(normalizedPattern)
      return regex.test(url)
    } catch (error) {
      console.error(`Invalid URL pattern: ${pattern}`, error)
      return false
    }
  })
}
```

Excerpt — `background/commands/index.ts:450-487` (abridged):

```ts
export const commandsToSuggestions = async (
  commands: Array<CommandNode>,
  context: Browser.Context,
  _parentName?: string,
  inheritedPermissions: BrowserPermission[] = [],
): Promise<Suggestion[]> => {
  const favoriteCommandIds = await getFavoriteCommandIds()
  const commandSettings = await getAllCommandSettings()

  return await Promise.all(
    commands.map(async (command) => {
      // ...
        keybinding: allowsKeybinding(node)
          ? normalizeKeybinding(
              commandSettings[node.id]?.keybinding || node.keybinding || "",
            ) || undefined
          : undefined,
        isFavorite: favoriteCommandIds.includes(node.id),
      // ...
```

Excerpt — `background/messages/searchCommands.ts` (the per-group conversion;
comment is verbatim from the file):

```ts
// Converts entries to suggestions while preserving entry order. Entries are
// grouped by their inherited-permission set so conversion stays batched (one
// commandsToSuggestions call per distinct permission set, each doing its own
// settings/favorites reads) instead of one call per entry.
const entriesToSuggestions = async (entries, context) => {
  // ... groups by permission key ...
  await Promise.all(
    [...groups.values()].map(async ({ permissions, indexes }) => {
      const suggestions = await commandsToSuggestions(
        indexes.map((index) => entries[index].command),
        context,
        undefined,
        permissions,
      )
      // ...
```

Conventions: `commandsToSuggestions` is exported and called from several
places (`background/messages/getCommands.ts`, `getChildrenCommands.ts`,
`searchCommands.ts`, `background/commands/query.ts` — verify with grep).
Signature changes must be backward compatible (optional trailing parameter).

## Commands you will need

| Purpose   | Command                                            | Expected on success |
|-----------|----------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                     | exit 0              |
| Tests     | `pnpm test`                                        | all pass            |
| Focused   | `pnpm test -- background/utils/urlFilter.test.ts`  | all pass            |
| Format    | `pnpm run fmt:check`                               | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `background/utils/urlFilter.ts`
- `background/utils/urlFilter.test.ts` (extend)
- `background/commands/index.ts` (ONLY the `commandsToSuggestions` signature
  and its two storage-read lines + the `includes` lookup)
- `background/messages/searchCommands.ts` (ONLY `entriesToSuggestions`)

**Out of scope** (do NOT touch):
- `background/commands/searchIndex.ts` — index build/invalidation is a
  separate concern; do not add caching there.
- Scoring (`searchScore.ts`), ranking, deep-search semantics.
- The rest of `commandsToSuggestions`'s 200-line body — no refactors beyond
  the three mechanical changes (decomposition is a separate backlog item).
- Write paths in `favorites.ts`/`settings.ts` (plan 004's territory).

## Git workflow

- Working tree contains uncommitted in-flight work. Do NOT commit, stage,
  stash, or revert unless the operator instructed it.
- If instructed to commit: branch `advisor/005-search-hot-path`, message
  `perf: cache url-rule regexes and batch settings reads in search path`.

## Steps

### Step 1: Memoize patternToRegex

In `background/utils/urlFilter.ts`, add a module-level cache above
`patternToRegex`:

```ts
const regexCache = new Map<string, RegExp>()
const MAX_REGEX_CACHE = 500
```

Wrap compilation: on cache hit return it; on miss compile, and if
`regexCache.size >= MAX_REGEX_CACHE`, `regexCache.clear()` before setting
(simple flush beats LRU bookkeeping here; 500 distinct patterns is far above
real usage). Key by the *normalized* (trimmed) pattern string. The function
is pure, so no invalidation is needed when settings change. Keep the thrown
error behavior for invalid patterns identical (do NOT cache failures).

**Verify**: `pnpm test -- background/utils/urlFilter.test.ts` → all pass

### Step 2: Accept pre-loaded favorites/settings in commandsToSuggestions

In `background/commands/index.ts`, extend the signature with an optional
trailing parameter:

```ts
export const commandsToSuggestions = async (
  commands: Array<CommandNode>,
  context: Browser.Context,
  _parentName?: string,
  inheritedPermissions: BrowserPermission[] = [],
  preloaded?: {
    favoriteCommandIds: ReadonlySet<string>
    commandSettings: Record<string, CommandSettings>
  },
): Promise<Suggestion[]> => {
  const favoriteIds =
    preloaded?.favoriteCommandIds ?? new Set(await getFavoriteCommandIds())
  const commandSettings =
    preloaded?.commandSettings ?? (await getAllCommandSettings())
```

Replace `favoriteCommandIds.includes(node.id)` with `favoriteIds.has(node.id)`.
All existing callers compile unchanged (parameter is optional); the Set
conversion in the default path also fixes the O(n) lookup for them.
(Import the `CommandSettings` type from wherever `getAllCommandSettings`'s
return type is declared — check `background/commands/settings.ts` exports.)

**Verify**: `pnpm run tsc` → exit 0; `pnpm test` → all pass

### Step 3: Load once per search in entriesToSuggestions

In `background/messages/searchCommands.ts`, at the top of
`entriesToSuggestions`, load both values once and pass them to every group's
`commandsToSuggestions` call:

```ts
const [favoriteCommandIds, commandSettings] = await Promise.all([
  getFavoriteCommandIds(),
  getAllCommandSettings(),
])
const preloaded = {
  favoriteCommandIds: new Set(favoriteCommandIds),
  commandSettings,
}
```

Import the two getters from their modules (`../commands/favorites`,
`../commands/settings` — match the import style of `commandsToSuggestions`'s
own imports in `background/commands/index.ts`). Also update the now-stale
code comment above `entriesToSuggestions` ("each doing its own
settings/favorites reads") to describe the new single-read behavior.

**Verify**: `pnpm test -- background/messages/searchCommands.test.ts` → all pass

## Test plan

- Extend `background/utils/urlFilter.test.ts`:
  1. Same pattern matched twice returns consistent results (cache hit path).
  2. Cache returns the *same* RegExp instance for the same pattern
     (`expect(a).toBe(b)` via exporting a test-only accessor, OR skip
     instance assertions and instead assert behavior: 600 distinct patterns
     don't break matching — exercising the flush path).
  3. Invalid pattern still reports no-match and doesn't poison subsequent
     valid patterns.
- `background/messages/searchCommands.test.ts` already exercises
  `entriesToSuggestions` indirectly — it must stay green. Add one assertion
  if the test file mocks `getFavoriteCommandIds`/`getAllCommandSettings`:
  they are called at most once per search request (use `vi.fn` call counts).
  If the existing mocks make this awkward, note it and rely on the green
  suite.
- No new behavior to test in `commandsToSuggestions` beyond compilation —
  existing `command-system.test.ts` coverage (favorites flags, keybinding
  resolution) must stay green, which proves the preloaded path defaults
  correctly.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0; `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n "regexCache" background/utils/urlFilter.ts` shows the cache in `patternToRegex`
- [ ] `grep -n "includes(node.id)" background/commands/index.ts` → no matches (Set lookup now)
- [ ] `grep -c "getFavoriteCommandIds\|getAllCommandSettings" background/messages/searchCommands.ts` shows the single-load in `entriesToSuggestions`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `commandsToSuggestions` has been decomposed/moved since planning (it may be
  — the audit also flagged it for decomposition; if so the same three changes
  apply to its successor, but re-derive locations and report the drift).
- Any caller of `commandsToSuggestions` passes positional arguments beyond
  `inheritedPermissions` already (grep first:
  `grep -rn "commandsToSuggestions(" background/`).
- `urlFilter.test.ts` reveals patternToRegex is NOT pure (e.g. depends on
  context or flags varying per call) — the cache would then be wrong.

## Maintenance notes

- If `commandsToSuggestions` is later decomposed (backlog item), keep the
  `preloaded` threading at the new orchestration boundary.
- If user-editable URL rules ever become per-pattern-flag configurable
  (case sensitivity etc.), the regex cache key must include the flags.
- Overlap with plan 004: that plan wraps the *write* paths in
  `favorites.ts`/`settings.ts`; this one only changes *read* call sites.
  Order-independent.
- Deferred (investigate before doing): caching `getAllCommandSettings` itself
  behind a storage-change-invalidated memo would also serve `get-commands`
  and keybinding paths, but it adds invalidation risk across the whole
  background — the audit scoped this plan to the zero-risk wins.
