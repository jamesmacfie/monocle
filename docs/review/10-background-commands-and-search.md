# 10 — Background Commands and Search (`CMD`)

Scope: `apps/extension/background/commands/` core modules (source, query,
execution, suggestions, searchIndex, searchScore, usage, favorites, traversal,
generatedActions, platform), the category folders as consumed by them,
`background/utils/urlFilter.ts` / `favicon.ts` / `permissions.ts`, and the
accuracy of `docs/search-and-ranking.md`, `docs/command-schema.md`,
`docs/command-types.md`, `docs/authoring-commands.md` against this code.

Overall assessment: this subsystem is in good shape. The old overloaded
`index.ts` has already been decomposed into focused modules with a logic-free
barrel, the search index build/cache/score layers are heavily commented and
well tested, and the docs are largely accurate. The findings below are mostly
consolidation of genuinely-duplicated tree-walk machinery, one module split
along a real pure/stateful seam, and a handful of small dead-code and
doc-accuracy fixes.

---

### CMD-01: Extract a shared permission-gated command-tree walker

**Priority:** P1     **Effort:** M     **Type:** dedupe

**Current state**
Three hand-rolled recursive walks re-implement the same skeleton — merge
inherited permissions, gate descent on a browser permission probe, call
`group.children(context)` inside a per-group `try/catch` that logs and
continues, URL-filter the resolved children, accumulate a breadcrumb, recurse:

- `apps/extension/background/commands/query.ts:130-194 (findFavoritedCommands)`
  — visits every node checking the favorites set; descends every permitted
  group; filters children via `filterForContext`.
- `apps/extension/background/commands/query.ts:398-458 (findCommandRecursive)`
  — visits every node checking an id match with early return; descends every
  permitted group; filters each level via `filterForContext`; additionally
  accumulates `parentIds`.
- `apps/extension/background/keybindings/source.ts:73-136 (collectDeepSearchEntries)`
  — visits every node collecting keybinding entries; descends only
  deep-search-enabled groups; filters children via `filterCommandsByUrl`.

A fourth walk, `apps/extension/background/commands/searchIndex.ts:218-365
(walkGroups)`, shares the permission gate and deep-search inheritance but
differs materially (see Non-findings) and is deliberately **excluded**.
`apps/extension/background/commands/traversal.ts:1-33 (mergePermissions,
appendUrlRuleChain)` already exists as the shared-traversal home but holds only
leaf helpers, no walker.

**Why it matters**
Any change to descent semantics — permission gating, URL-visibility ordering,
error handling for a failing `children()` — must land identically in three
places across two subsystems (palette favorites/resolution and the keybinding
registry). The bug class is silent divergence: a command hidden from the
palette by one walk while its keybinding still resolves through another, or a
permission-revocation behaving differently between favorites and execution
resolution. A new engineer reading `query.ts` cannot tell whether the two walks
there differ deliberately or by drift.

**Proposed change**
Add a visitor-based walker to the existing
`apps/extension/background/commands/traversal.ts` (do not create a new file —
`traversal.ts` is the established home):

```ts
export type WalkNode = {
  command: CommandNode
  permissions: BrowserPermission[]   // merged inherited + own
  parentNames: string[]              // immediate parent first
  parentIds: string[]                // immediate parent first
}

export type WalkOptions = {
  context: Browser.Context
  commandSettings: Record<string, CommandSettings>
  /** Called for every visited node. Return "stop" to end the whole walk. */
  visit: (node: WalkNode) => void | "stop" | Promise<void | "stop">
  /** Gate for descending into a permitted group. Default: always descend. */
  shouldDescend?: (group: WalkNode & { command: GroupCommandNode }) => boolean
}

export const walkCommandTree = async (
  commands: CommandNode[],
  options: WalkOptions,
): Promise<void>
```

The walker owns: `mergePermissions`, the empty-fast-path permission probe
(CMD-02's helper), `filterCommandsByUrl` per level, `resolveCommandName` for
the breadcrumb, and the per-group `try/catch` + `console.error`. Steps:

1. Land CMD-02 first (the walker consumes both helpers).
2. Implement `walkCommandTree` with co-located tests in `traversal.test.ts`.
3. Rewrite `findFavoritedCommands` as a `visit` callback collecting favorites
   (the caller keeps its current name-rewriting logic; note the current code
   filters the root list before calling, and the walker must equally accept a
   pre-filtered root — make root filtering the caller's job, exactly as today).
4. Rewrite `findCommandRecursive` as a `visit` callback with `"stop"` on match.
   Note one deliberate asymmetry to preserve: `findCommandRecursive` URL-filters
   the root level itself (query.ts:407-411) while `findFavoritedCommands`
   receives an already-filtered root — keep resolution output identical.
5. Keybinding-side adoption of the walker for `collectDeepSearchEntries` is
   specced by file 14 (KEY); this finding only requires the walker's
   `shouldDescend` be expressive enough for it (deep-search-only descent via
   the CMD-02 helper), which the signature above is.

All three current walk functions are module-private, so no public API changes.

**Do NOT change / risks**
- `walkGroups` in `searchIndex.ts` stays as-is (see Non-findings §1).
- `settingsCatalog.ts:139-172 (visitCommand)` stays as-is: it deliberately has
  no permission gate and descends only `settingsCatalog.includeChildren`
  groups — different contract, not drift.
- Favorites breadcrumb output (`[leaf, ...ancestors]` name arrays) and
  `ResolvedCommand.parentNames/parentIds` ordering must stay byte-identical —
  the palette and usage recording depend on them.
- Do not add walker parameters with a single consumer (e.g. rule-chain
  accumulation, which only `walkGroups` needs) — that is the banned
  one-call-site abstraction.

**Verification**
- Existing suites stay green: `command-system.test.ts` (favorites, context
  loading, URL-denied resolution), `browser-commands.test.ts`,
  `searchIndex.test.ts`.
- New tests in `traversal.test.ts`: descend blocked by missing permission;
  failing `children()` skips subtree without sinking siblings; `"stop"`
  short-circuits; breadcrumb order; URL-filtered child excluded from visits.
- Parity test: for a fixture tree, assert `getCommandCollections` favorites and
  `resolveCommandById` output before/after are deep-equal.

**Related**
CMD-02 (prerequisite). KEY file 14 (keybinding-side adoption of the walker).

---

### CMD-02: Extract shared deep-search-inheritance and permission-gate helpers

**Priority:** P2     **Effort:** S     **Type:** dedupe

**Current state**
Two boolean fragments are duplicated verbatim across subsystems:

- Deep-search flag inheritance `enableFlag === true || (inheritedDeepSearch &&
  enableFlag !== false)` appears in
  `apps/extension/background/commands/searchIndex.ts:234-236 (walkGroups)` and
  `apps/extension/background/keybindings/source.ts:95-97 (collectDeepSearchEntries)`.
- The "empty permissions fast-path then `checkPermissions`" probe appears as
  `apps/extension/background/commands/query.ts:62-82 (checkRequiredPermissions,
  hasRequiredPermissions)`, again as
  `apps/extension/background/keybindings/source.ts:40-45 (hasRequiredPermissions)`,
  and inline at `apps/extension/background/commands/searchIndex.ts:254-259
  (walkGroups)`. Note `apps/extension/background/utils/permissions.ts:30-35
  (checkPermissions)` already fast-paths the empty array, so the wrappers'
  stated purpose ("empty-set fast path") is already provided by the callee.

**Why it matters**
The inheritance formula is subtle (`!== false`, not `=== true` — children
inherit unless they explicitly opt out) and decides both which commands are
searchable from root and which default keybindings register. If one copy is
"fixed" without the other, the palette and keybinding registry silently
disagree about the same group. The redundant permission wrappers make readers
hunt for a difference that does not exist.

**Proposed change**
1. Add to `apps/extension/background/commands/traversal.ts`:

```ts
/** Deep-search opt-in with inheritance: a group is deep-searchable when it
 *  sets enableDeepSearch: true, or when an ancestor did and it does not set
 *  enableDeepSearch: false. */
export const shouldDeepSearchGroup = (
  group: GroupCommandNode,
  inheritedDeepSearch: boolean,
): boolean =>
  group.enableDeepSearch === true ||
  (inheritedDeepSearch && group.enableDeepSearch !== false)

/** True when every permission is granted; empty array short-circuits inside
 *  checkPermissions. Browser truth, not Redux. */
export const hasAllPermissions = async (
  permissions: BrowserPermission[],
): Promise<boolean> =>
  (await checkPermissions(permissions)).hasAllPermissions
```

2. Replace the formula at `searchIndex.ts:234-236` and
   `keybindings/source.ts:95-97` with `shouldDeepSearchGroup`.
3. Replace `keybindings/source.ts:40-45` and the `query.ts:78-82` wrapper with
   `hasAllPermissions`; keep `query.ts` `checkRequiredPermissions` only where
   the caller needs `missingPermissions`
   (`getCommandPageCommands`) — there it can call `checkPermissions` directly
   and the local wrapper can be deleted.

**Do NOT change / risks**
- Do not change the formula's semantics; the `!== false` inheritance is
  documented behavior (`docs/search-and-ranking.md` "Opting in").
- The site-SDK conversion inverts the deep-search default for grouped site
  commands at node-construction time — that is a different concern; leave it.

**Verification**
- `searchIndex.test.ts` ("skips descending into non-deep-search groups…") and
  keybinding source tests stay green.
- New table test for `shouldDeepSearchGroup` covering the
  true/false/undefined × inherited matrix (6 cases) in `traversal.test.ts`.

**Related**
CMD-01 (consumes both helpers). KEY file 14.

---

### CMD-03: Split `searchIndex.ts` into pure index build vs cache lifecycle

**Priority:** P2     **Effort:** M     **Type:** decompose

**Current state**
`apps/extension/background/commands/searchIndex.ts` (872 LOC) contains two
genuinely different kinds of code:

- **Pure build**: `apps/extension/background/commands/searchIndex.ts:175-214
  (createEntry)`, `:218-365 (walkGroups)`, `:382-464 (dedupeEntries)`,
  `:476-538 (buildSearchIndex)` plus their constants/types
  (`DEEP_SEARCH_RANK_WEIGHTS`, `IndexEntry`, `EntryParams`, `BuildShared`).
  These read storage once at the top and otherwise touch no module state.
- **Cache lifecycle and query-path state**: five module-scoped mutable caches
  with three distinct freshness contracts — `cachedIndex`/`inflightBuild`
  (`:99-103`), the stale-while-revalidate `staleIndex` (`:105-110`), the
  memoized URL-filtered view `visibleCache` (`:112-120`), the usage-rank cache
  `cachedUsageRank` (`:121-128`), and the child-page cache `childPageCache`
  (`:747-805 (getChildPageSearchData)`) — plus `getSearchIndex` (`:540-615`),
  invalidation (`:634-651`), event wiring (`:811-864
  (initializeSearchIndexInvalidation)`), and `buildEphemeralIndexEntries`
  (`:715-745`).

**Why it matters**
The file's hard part is the cache choreography (which invalidations retain
stale, which drop, what the child-page cache inherits), but a reader tracing
that must scroll through ~360 lines of tree-walk/dedupe logic interleaved with
it. Conversely, someone changing dedupe semantics is exposed to five mutable
caches they must convince themselves they haven't perturbed. The seam is real:
the build half is (storage-read + pure), the other half is all state.

**Proposed change**
1. Create `apps/extension/background/commands/searchIndexBuild.ts` and move,
   unmodified: `DEEP_SEARCH_RANK_WEIGHTS`, `DEFAULT_DEEP_SEARCH_WEIGHT`,
   `IndexEntry`, `EntryParams`, `BuildShared`, `toLowerName`, `toDisplayName`,
   `resolveEntryKeybinding`, `createEntry`, `walkGroups`, `dedupeEntries`,
   `buildSearchIndex` (export `buildSearchIndex`, `createEntry` — the latter is
   needed by `buildEphemeralIndexEntries` — plus the types/constants). Give it
   the standard top-of-file architecture block.
2. `searchIndex.ts` keeps everything stateful (`SearchIndex` type, the five
   caches, `getSearchIndex`, `getServableStaleIndex`, `invalidateSearchIndex`,
   `dropSearchIndexCaches`, `getUsageRankMap`, `getVisibleEntries`,
   `filterIndexEntriesByUrl`, `buildEphemeralIndexEntries`,
   `getChildPageSearchData`, `initializeSearchIndexInvalidation`,
   `warmSearchIndex`) and **re-exports** `IndexEntry` and
   `DEEP_SEARCH_RANK_WEIGHTS` so no importer changes:
   `background/messages/searchCommands.ts:12-17`, `background/index.ts:21`,
   `searchIndex.test.ts:13`, and the message handlers that import
   `invalidateSearchIndex` all keep their current import paths.
3. This is a pure move: no function bodies change; ranking output stays
   byte-identical.

**Do NOT change / risks**
- Do not go further (e.g. a third module for the child-page cache): the caches
  share one invalidation entry point (`invalidateSearchIndex` clears
  `childPageCache` and `visibleCache` together, `searchIndex.ts:634-645`) and
  splitting them would trade cohesion of the freshness contract for file count.
- Do not convert the module-scoped caches into a class/registry — the
  module-singleton pattern is the repo's documented service-worker-lifetime
  idiom (mirrors `keybindings/source.ts:193-213`).
- `dedupeEntries` semantics (Pass A/Pass B, keyword absorption) are pinned by
  tests and docs — move, don't touch.

**Verification**
- `pnpm test` green with `searchIndex.test.ts` and `searchCommands.test.ts`
  unmodified (their import paths must not need edits — that is the acceptance
  test for the re-export surface).
- `pnpm run tsc`, `pnpm run build`, `pnpm run build:firefox`.

**Related**
CMD-02 (the moved `walkGroups` should already use `shouldDeepSearchGroup`;
land CMD-02 first to avoid moving code twice). CMD-04 (header comment moves
with the build file — apply the rewrite wherever the paragraph ends up).

---

### CMD-04: Fix the misleading "replaces the previous tree walks" claim in the searchIndex header

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
`apps/extension/background/commands/searchIndex.ts:10-13` (module header)
reads:

> Building the index is the single resolve pass that replaces the previous
> per-get-commands tree walks: settings and favorites are read once, and each
> group's children() is called exactly once, shared by favorites collection
> and deep-search flattening.

But the per-get-commands favorites walk still exists and still runs on every
`monocle-commands-get`: `apps/extension/background/commands/query.ts:130-194
(findFavoritedCommands)`, called from `query.ts:245 (getCommandCollections)`.
The index's favorites entries serve only the typed-search path.
`docs/search-and-ranking.md` (§"How favorites are surfaced") describes the two
walks correctly; the code comment contradicts it.

**Why it matters**
A reader deciding where to change favorites behavior — or whether
`findFavoritedCommands` is dead code — is pointed the wrong way by the header
of the most-read file in the subsystem. This exact confusion is what a
maintainability reviewer hits first (it seeded this review's hypothesis 1).

**Proposed change**
Replace lines 10-13 of `searchIndex.ts` with, verbatim:

```
// Building the index is a single resolve pass for the per-keystroke search
// path: settings and favorites are read once, and each group's children() is
// called exactly once, shared by nested-favorite entries and deep-search
// flattening. The root empty state (monocle-commands-get) does NOT use the
// index: query.ts still walks the tree per request (findFavoritedCommands)
// with the real page context, so context-dependent children stay correct
// there. See docs/search-and-ranking.md.
```

**Do NOT change / risks**
Comment-only; no code. If CMD-03 has landed, the paragraph lives at the top of
`searchIndexBuild.ts` — apply the same text there.

**Verification**
`pnpm run fmt:check`. Read-through against `query.ts:232-261
(getCommandCollections)` to confirm the claim.

**Related**
CMD-03.

---

### CMD-05: Correct the invalidation-event list and document the real cache layers in `docs/search-and-ranking.md`

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
Three claims in `docs/search-and-ranking.md` no longer match
`apps/extension/background/commands/searchIndex.ts`:

1. The Invalidation section (doc §"Invalidation", first bullet) lists
   `tabs.onCreated/onRemoved/onUpdated/onActivated`. The code deliberately has
   **no** `onActivated` listener and gates `onUpdated` to url/title changes
   (`searchIndex.ts:820-834 (initializeSearchIndexInvalidation)`); the test
   "ignores loading/favicon-only tab updates and never listens to onActivated"
   (`searchIndex.test.ts:387`) pins this.
2. The doc never mentions stale-while-revalidate: browser-data events
   invalidate with `retainStale: true` and the next query is served from the
   outgoing snapshot while the rebuild runs (`searchIndex.ts:105-110,
   596-608, 634-645 (invalidateSearchIndex)`), bounded by
   `STALE_SERVE_LIMIT_MS`.
3. The handler section says child search "builds ephemeral entries from
   `getCommandPageCommands(...)`" with no mention of the child-page cache
   (`searchIndex.ts:755-805 (getChildPageSearchData)`, 15 s TTL, max 8 pages,
   cleared by every `invalidateSearchIndex()`).

**Why it matters**
The invalidation list is exactly what an engineer consults when search shows
stale rows; a list that names a listener that intentionally does not exist
(and omits the stale-serve window that *explains* one-debounce staleness)
sends them debugging phantom code paths.

**Proposed change**
Three verbatim edits to `docs/search-and-ranking.md`:

1. Replace the bullet `- tabs.onCreated/onRemoved/onUpdated/onActivated` with:

```markdown
- `tabs.onCreated/onRemoved`, and `tabs.onUpdated` only when the change carries a `url` or `title` (loading-status and favicon churn never invalidate). There is deliberately **no** `tabs.onActivated` listener: switching tabs changes neither the tab set nor any match text; the open-tabs rows' active-tab highlight is frozen at build time and bounded by the TTL.
```

2. Insert after the bullet list (before "Hidden and URL-rule writes…"):

```markdown
Browser-data events (tabs/history/bookmarks/sessions) invalidate with `retainStale: true`: the outgoing index is kept as a **stale-while-revalidate** snapshot, so the query that triggers the rebuild is answered immediately from slightly stale data (bounded by `STALE_SERVE_LIMIT_MS`, 4× the index TTL) while the rebuild finishes in the background. Permission, settings, and favorites invalidations drop the snapshot outright — hiding a command or denying a domain takes effect on the very next query.
```

3. Replace the "**Child pages**: …" bullet in §"The `monocle-commands-search`
   handler" with:

```markdown
- **Child pages**: builds ephemeral entries from the page's children and runs the same scorer. The fetched page and its entries are cached per context + URL + `parentPath` for a short TTL (`getChildPageSearchData`, 15 s, max 8 pages) so one typing burst refetches children once, not per keystroke. Every `invalidateSearchIndex()` clears this cache, and child pages never serve stale. An empty child query returns all children in load order.
```

Also update the sentence at the end of the Invalidation section from
"`invalidateSearchIndex()` also drops the memoized URL-filtered view." to
"`invalidateSearchIndex()` also drops the memoized URL-filtered view and the
child-page cache."

**Do NOT change / risks**
Doc-only. Do not restructure the rest of the file; the larger reorganization
of the cache-layer story (if any) belongs to the docs pass (file 40).

**Verification**
Read the edited sections against `searchIndex.ts:634-645, 755-805, 811-864`
and `searchIndex.test.ts` ("tab event invalidation scope",
"stale-while-revalidate bounds", "child page search caching").

**Related**
DOCS file 40.

---

### CMD-06: Update the `source.ts` excerpt in `docs/authoring-commands.md` for peer-extension commands

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
The `loadCommandEntries` excerpt in `docs/authoring-commands.md` (§"Step 4")
omits the peer-extension line that exists in
`apps/extension/background/commands/source.ts:78-81 (loadCommandEntries)`:
`...mapCommandsToEntries(loadExtensionSdkCommands(), categories.extensions)`.
The "Key facts" bullet ("All nine categories are wired here…") likewise
describes `extensions` as only `extensionsCommands`.

**Why it matters**
Step 4's whole point is "confirm the orchestration path loads your category";
an excerpt missing a registration line teaches authors the wrong checklist and
invites copy-paste drift when the next category is added.

**Proposed change**
1. In the code excerpt, after the `extensionsCommands` line, add verbatim:

```ts
  ...mapCommandsToEntries(loadExtensionSdkCommands(), categories.extensions),
```

2. In "Key facts", change
   "`extensions` (`extensionsCommands`)" to
   "`extensions` (`extensionsCommands`, plus peer-extension commands from
   `loadExtensionSdkCommands()` — durable, context-free, served from the
   warmed registry cache)".

**Do NOT change / risks**
"Nine categories" stays correct — the SDK commands reuse the `extensions`
category (`source.ts:40-50 (categories)`); do not bump the count.

**Verification**
Diff the excerpt against `source.ts:61-93 (loadCommandEntries)` line-for-line.

**Related**
DOCS file 40; extension-SDK review file 30.

---

### CMD-07: Delete the dead `findCommand` export from the commands barrel

**Priority:** P3     **Effort:** S     **Type:** dead-code

**Current state**
`apps/extension/background/commands/index.ts:38-49 (findCommand)` is exported
but has zero call sites anywhere in the repo (including tests; verified by
grep for `findCommand\b` — the only other hits are the unrelated
`findCommandInPage` in `shared/store/slices/navigation.slice.ts:68`). Its doc
comment says the unused first argument is "kept for call-site compatibility",
but there are no call sites to be compatible with.

**Why it matters**
A barrel export with a compatibility-shim signature and a false comment invites
new code to adopt the awkward `(_commands, id, context)` shape instead of
`resolveCommandById`, and makes the barrel look less logic-free than it is.

**Proposed change**
Delete `findCommand` (lines 38-49) and the now-unused `resolveCommandById`
import from `apps/extension/background/commands/index.ts:15`. Callers needing
resolution already import `resolveCommandById` / `resolveCommandInPage` from
`./query` directly.

**Do NOT change / risks**
Keep the `getCommands` wrapper (`index.ts:28-36`) — it is the live import
surface for `background/messages/getCommands.ts:4` and
`background/features/nativeMessaging/suggestions.ts:18`.

**Verification**
`pnpm run tsc` (an actual consumer would fail the build), `pnpm test`.

**Related**
—

---

### CMD-08: Retire the deprecated `getFaviconUrl` alias

**Priority:** P3     **Effort:** S     **Type:** dead-code

**Current state**
`apps/extension/background/utils/favicon.ts:36-44 (getFaviconUrl)` is tagged
`@deprecated Use getFaviconIcon instead` but has three live call sites, all
with the identical DDG-or-Globe pattern:
`apps/extension/background/commands/browser/bookmarks.ts:67 (processBookmarkNode)`,
`apps/extension/background/commands/browser/recentlyClosed.ts:65 (children)`,
`apps/extension/background/commands/browser/history.ts:100
(createHistoryItemCommand)`. The function is a one-line alias for
`getDuckDuckGoFaviconUrl`. The seeded hypothesis ("zero call sites, delete")
is **refuted** — it is not dead, it is a mislabeled alias.

**Why it matters**
The deprecation points authors at `getFaviconIcon`, but migrating these three
sites there would *change behavior*: `getFaviconIcon` prefers the
`chrome://favicon` local service (`favicon.ts:51-105 (getFaviconIcon)`), which
these sources (no `browserFaviconUrl` available) do not use today. Meanwhile
every new bookmark/history-style command author faces a "deprecated but used
everywhere" signal and guesses.

**Proposed change**
Keep behavior identical and remove the misleading layer: at the three call
sites, replace `getFaviconUrl(...)` with `getDuckDuckGoFaviconUrl(...)`
(adjusting the import from `../../utils/favicon`), then delete `getFaviconUrl`
from `favicon.ts`.

**Do NOT change / risks**
- Do **not** migrate the three sites to `getFaviconIcon`: it is async, changes
  icon-source priority, and `chrome://favicon` availability under MV3 is its
  own question — out of scope for a rename.
- The tab-based commands (`openTabs.ts:47`, `gotoTab.ts:22`,
  `copyTabUrl.ts:23`) correctly use `getFaviconIcon` with `browserFaviconUrl`;
  leave them.

**Verification**
`pnpm run tsc`; spot-check bookmark/history/recently-closed rows still render
DDG favicons with Globe fallback in a manual palette check.

**Related**
—

---

### CMD-09: Extract row-action-menu construction out of `commandsToSuggestions`

**Priority:** P3     **Effort:** S     **Type:** decompose

**Current state**
`apps/extension/background/commands/suggestions.ts:190-410
(commandsToSuggestions)` is a single ~220-line function whose per-command
closure does two documented-as-distinct jobs: node→`Suggestion` conversion
(`:206-289`) and generated action-menu assembly (`:291-406` — primary action,
the four-entry modifier table, favorite/hide/hide-from-domain/keybinding
actions). The individual action builders (`:32-180`) are already factored;
only the assembly block is inlined.

**Why it matters**
Docs treat "conversion" and "generated actions" as separate concepts
(`docs/execution-and-actions.md`, `docs/command-schema.md` §"Node to
Suggestion"), but the code fuses them mid-closure, so a change to the action
menu (a routinely-touched surface — every new generated action lands here)
forces a reader through the conversion branches and vice versa.

**Proposed change**
Extract `:291-406` into a module-private helper in the same file:

```ts
const buildRowActions = async (
  node: CommandNode,
  context: Browser.Context,
  effectivePermissions: BrowserPermission[],
  modifierActionLabels: ModifierActionLabel | undefined,
  favoriteCommandIds: ReadonlySet<string>,
  commandSettings: Record<string, CommandSettings>,
): Promise<Suggestion[]>
```

`commandsToSuggestions` calls it once per node and attaches the result exactly
as today (`:399-406`). Pure move; suggestion output must be deep-equal before
and after. Opportunistically hoist the constant modifier `defs` table
(`:328-358`) to module scope — it allocates per node per conversion today.

**Do NOT change / risks**
- Do **not** split conversion per node kind: the six-branch `if/else`
  (`:240-289`) is a flat, consistent switch — explicitly fine under the guard
  list. (This half of seeded hypothesis 3 is refuted.)
- Leave the `as any` casts (`:225, :268, :301`) alone here; suggestion-type
  tightening is a `shared/types/ui.ts` concern and touches the UI boundary.
- Action ids and ordering are a wire contract with the UI's action menu — the
  array order in the output must not change.

**Verification**
Existing generated-action assertions in `command-system.test.ts` and
`browser-commands.test.ts` ("attaches `<id>-enter-action`,
`toggle-favorite-<id>`, `hide-from-domain-<id>`") stay green; add one
deep-equality snapshot of `commandsToSuggestions` output for a fixture
action+group pair if not already covered.

**Related**
Execution-side dispatch of these actions is
`background/commands/execution.ts:171-245 (executeGeneratedAction)` — reviewed,
no change needed (see Non-findings §8).

---

## Non-findings (reviewed, justified)

1. **`walkGroups` not folded into the CMD-01 shared walker** — it differs
   materially, not incidentally: it defers URL filtering to query time via
   per-entry rule chains instead of filtering per level
   (`searchIndex.ts:86-87, 267-270`), resolves a per-branch source weight from
   the root deep-search group id (`:249-252`), builds entries from *children*
   with type discrimination rather than visiting nodes, and its descend
   condition mixes deep-search with favorites existence (`:239-241`).
   Supporting all that would need per-branch accumulator plumbing with exactly
   one consumer — the banned single-call-site abstraction. It should share the
   CMD-02 helpers only.
2. **`getRankedCommandIds` vs `getRankedRootCommandIds` naming
   (`usage.ts:259-274`)** — seeded hypothesis refuted: the names carry the real
   distinction (leaf ids for search boost vs root-aggregated ids for the
   empty-state strip), both carry explanatory comments, both are documented in
   `docs/search-and-ranking.md`, and root aggregation is tested
   (`command-system.test.ts:321`).
3. **Per-node-kind decomposition of `suggestions.ts`** — not warranted; the
   six-branch conversion is a flat, consistent switch (guard list: fine as-is).
   Only the action-menu block earns extraction (CMD-09).
4. **`searchCommands.ts:38-42 (lastRootSearch)` module-scoped narrowing
   state** — shared across tabs/contexts but safe by construction (base-array
   identity check falls back to a full scan), thoroughly commented, and pinned
   by tests ("incremental narrowing" suite).
5. **`query.ts:201-230 (sortSuggestionsByUsage)` reading
   `getRankedRootCommandIds` directly instead of a cached map** — different
   rank source than `getUsageRankMap` (root-aggregated vs leaf), and
   `monocle-commands-get` runs per palette open, not per keystroke; caching it
   would add a third freshness contract for no hot-path win.
6. **Five module-scoped caches instead of a cache class** — matches the repo's
   established service-worker-lifetime idiom (`keybindings/source.ts` header
   explicitly cross-references it); a class would be a competing pattern.
7. **`userConfigurableCommands.ts:30-50` hand-curated list** (excludes
   extensions/automations/features/site-SDK) — deliberate curation for the
   palette-based management surfaces: it picks only `toggleTheme` from the UI
   set on purpose, and the maintenance trap is documented with tests
   (`docs/authoring-commands.md` §"The `allCommands` context-free trap"). The
   options page uses the separate, opt-in `settingsCatalog.ts` projection —
   two projections with different contracts, not duplication.
8. **`execution.ts` generated-action dispatch as a flat `if` chain
   (`:171-245`)** — linear, one branch per action type, mirrors the codec in
   `shared/utils/generated-actions.ts`; a handler map would be dynamic dispatch
   for six static cases.
9. **`websites/` staying a command array (`websites/index.ts:1-5`)** — the
   plugin-registry decision is documented as pending; nothing here preempts it
   and no finding depends on its outcome.
10. **URL-free index build skipping URL-dependent `children()`** (GitHub
    prototype's nested rows absent from root search) — a documented,
    deliberate trade-off (`docs/search-and-ranking.md` "Consequence of the
    URL-free build"); fixing it would reintroduce per-URL index rebuilds.
11. **`urlFilter.ts` `patternToRegex` cache clearing wholesale at 500 entries
    (`:214-217`)** — a runaway guard far above real pattern counts; LRU
    machinery would be over-engineering.
12. **`checkPermissions` issuing one `permissions.contains` per permission
    (`permissions.ts:41-54`) instead of one `getAll` subset check** — a
    perf-only concern; every caller in this subsystem sits behind the index or
    keybinding caches, and `getGrantedPermissions` already exists for callers
    that need the set shape.
13. **`shouldShowCommand` duplication between `filterCommandsByUrl` and
    `isCommandVisibleForUrl` (`urlFilter.ts:300-338`)** — both funnel into the
    single private `shouldShowCommand`; the two entry points differ only in
    batch-vs-single shape and the hidden-check ordering, which is required by
    the index's `Pick<CommandNode, "urlRules">` chain links.
