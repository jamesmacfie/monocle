# Search and Ranking

This document describes how commands are *found* in Monocle: how the background-owned search index and scorer answer palette queries, how usage-based ranking and favorites are computed, how deep search flattens nested commands into root search results, how `search`-type command nodes resolve typed queries server-side, and how per-page search state is preserved during navigation.

## Background-owned search model

Palette search is owned entirely by the background service worker. CMDK on the UI side is a **list renderer and keyboard navigator only** — the palette mounts `<Command shouldFilter={false}>` and never scores or hides rows itself.

The split of responsibilities:

1. **Empty query** — `get-commands` returns the root empty state: `favorites` and usage-ranked `suggestions` (`background/messages/getCommands.ts` → `getCommandCollections`). The UI renders these instantly with no search round-trip.
2. **Non-empty query** — the UI debounces ~200 ms and sends `search-commands` (`background/messages/searchCommands.ts`). The background scores entries from its in-memory search index (root pages) or from the page's children (child pages), sorts, slices the top N (default 40), converts only those to `Suggestion`s, and returns them. The UI renders them as a single flat "Results" group.

All pages search through the background — root and child group pages alike. The exceptions:

- **`search`-type command pages** keep their own `get-children-commands` flow (`getResults` server-side); see [Search command nodes](#search-command-nodes).
- **Form pages** (any page containing an `input` or `submit` suggestion) bypass search entirely: every row stays visible while typing. Display-only rows (NoOp empty/error states) do not trigger the bypass.

## The search index

`background/commands/searchIndex.ts` keeps a module-scoped in-memory index (the same service-worker lifetime pattern as `background/keybindings/registry.ts`).

### What is indexed

`buildSearchIndex` performs one resolve pass:

1. `getAllCommandSettings()` and `getFavoriteCommandIds()` are read **once** (previously these were re-read per converted suggestion).
2. All root commands become `IndexEntry` values with pre-lowercased match fields (`nameLower`, `breadcrumbLower`, `keywordsLower`, `descriptionLower`, `keybindingLower`).
3. The group tree is walked **once**: each group's `children()` is called exactly one time, and the resolved children feed both favorites collection and deep-search flattening. The walk skips non-deep-search subtrees entirely when there are no favorites, and is skipped altogether when there are neither deep-search roots nor favorites.
4. Deep-search descendants (see [Deep search](#deep-search)) become entries carrying their source weight and `dedupeKey`; nested favorites become entries with breadcrumb names.
5. Entries are deduplicated at build time (see [Deduplication](#deduplication-and-dedupekey)).

Suggestions are **not** built at index time — `commandsToSuggestions` (with its eager action menus) runs only against the top-N entries returned per query.

Site SDK commands are included only when the request sender has a scoped
registration. The SDK scope/revision is part of the cache key, and SDK entries
are built with the real page URL/title so page-owned labels and URL rules stay
document-specific.

### Cache key, TTL, and URL filtering

- The cache key is `isNewTab|platform` only — **not** the URL. The index is built with a URL-free context, and each entry stores a `urlRuleChain` (its own and every ancestor group's `urlRules`). URL visibility and global hidden settings are applied per query via `filterIndexEntriesByUrl`, so the cache survives page navigation and user visibility changes take effect immediately.
- A ~30 s TTL is the staleness backstop; browser events are the primary invalidation.
- The index reads `getAllCommandSettings()` once at build time and stores the result on the `SearchIndex` (`commandSettings`), so the per-query URL filter needs no storage read.
- The URL-filtered view is memoized: `getVisibleEntries(index, url)` caches the filtered array keyed by index identity + URL, so the full `urlRuleChain` scan runs once per `(index, url)` rather than on every keystroke. A rebuild produces a new index object, which drops the memo implicitly.
- Each entry is tokenized at build time (`computeScorableTokens`): word-start tokens for the name and a pre-combined list of non-empty "rest" fields plus their tokens. The per-keystroke scorer consumes these directly, so it never re-runs the word-split regex or allocates a combined field array.

Consequence of the URL-free build: command sources whose `children()` depend on the page URL (e.g. the GitHub website prototype) do not contribute nested entries to root search. Their root-level rows still index normally, and the context-aware `get-commands` favorites path is unaffected.

### Invalidation

`initializeSearchIndexInvalidation()` (called from `background/index.ts`, alongside `warmSearchIndex()` which pre-builds at service-worker startup) wires `invalidateSearchIndex()` to:

- `tabs.onCreated/onRemoved/onUpdated/onActivated`
- `history.onVisited/onVisitRemoved`
- `bookmarks.onCreated/onRemoved/onChanged/onMoved`
- `sessions.onChanged`
- `permissions.onAdded/onRemoved`
- `storage.onChanged` for the `monocle-settings` and `monocle-favoriteCommandIds` keys (this covers settings and favorites mutations without import cycles — both write `chrome.storage.local`, and `storage.onChanged` fires for same-context writes)

Hidden and URL-rule writes also invalidate the index directly from their message
handlers; the storage listener remains the backstop for external or same-key
updates.

A `monocle-commandUsage` write does **not** rebuild the index; it only clears the lighter usage-rank cache (below), since usage affects ranking, not membership. `invalidateSearchIndex()` also drops the memoized URL-filtered view. Every listener is existence-guarded (`api.x?.onY?.addListener`) for Firefox.

## Scoring

`background/commands/searchScore.ts` is pure (no cmdk, no browser APIs). For a lowercased query:

**Name tiers** — exact `1.0` → prefix `0.9` → word-boundary `0.75` → substring `0.6` → fuzzy subsequence `0.4 × density` (density = query length / matched span).

**Rest fields** (breadcrumb, keywords, description, keybinding) — best of: prefix `0.4` / word-boundary `0.3` / substring `0.2` / subsequence `0.1`.

Combined:

```
textual = min(1, name*0.8 + rest*0.2 + (namePrefix ? 0.1 : 0))
final   = textual * sourceWeight * usageBoost
```

- `sourceWeight` is `1.0` for root commands and favorites, or the deep-search weight (below).
- Site SDK root commands and SDK deep-search descendants use the native
  `1.0` source weight by default.
- `usageBoost = 1 + 0.15 * (1 - rank/rankedCount)` for commands present in `getRankedCommandIds()`, else `1`. Usage is a tie-breaker, not a dominator — it cannot lift a substring match above a prefix match.

Ties break: favorites first → lower usage rank → shorter name → id. Zero-score entries are dropped; the scorer is never called with an empty query.

## The `search-commands` handler

`background/messages/searchCommands.ts`:

- **Root** (`parentPath` empty/undefined): scores the URL-filtered index entries (`getVisibleEntries`). An empty root query returns `[]` (the root empty state is `get-commands`' job).
- **Child pages**: builds ephemeral entries from `getCommandPageCommands(context, parentPath)` (already URL-filtered) and runs the same scorer. An empty child query returns all children in load order.
- Top-N (default 40, capped 200) entries are converted via batched `commandsToSuggestions` calls (grouped by inherited-permission set), and deep-search results are stamped with `rankWeight`.
- The response echoes `seq` and `query` so the UI can drop stale/out-of-order responses.

### Incremental narrowing (root)

Every scoring tier is monotonic under appending — if a query scores zero for an entry, any extension of that query also scores zero. So the match set for `prev + chars` is always a subset of the match set for `prev`. The handler keeps module-scoped state (`lastRootSearch`) holding the prior query and **all** of its matched entries (not the sliced top-N). When the next query extends the prior one against the same visible base (identity check), it re-scores only those candidates instead of the full index; otherwise (backspace, paste, a different prefix, a rebuilt index, or a URL change) it falls back to a full scan. The state is shared across tabs — a mismatch only costs a full scan, never a wrong result. This is what makes character-by-character typing collapse to a tiny candidate set after the first keystroke.

## Usage-based ranking

Ranking lives entirely in `background/commands/usage.ts` and is persisted under `chrome.storage.local` key `monocle-commandUsage`.

### What is recorded, and when

`recordCommandUsage(commandId, parentNames?)` is called from `executeResolvedCommand` in `background/commands/index.ts` *after* a successful execute, gated by `shouldRecordUsage`:

- `action` commands: always recorded.
- `submit` commands: recorded unless `doNotAddToRecents === true`.
- All other node types (`group`, `search`, `input`, `display`): never recorded.

Each recording updates the command's `CommandUsageStats`:

| Field | Meaning |
| --- | --- |
| `commandId` | The id being tracked |
| `totalUsage` | Lifetime execution count (incremented each record) |
| `lastUsed` | `Date.now()` of the most recent execution |
| `hourlyUsage` | 24-element array; the current `getHours()` bucket is incremented |
| `emaScore` | Exponential moving average of the computed score (smoothing) |
| `parentNames` | Optional breadcrumb context for nested commands |

### How the score is computed

`calculateCommandScore(stats, currentHour)` combines four factors (constants from the module):

- **Frequency** — `Math.log(totalUsage + 1)`, logarithmic so heavy-use commands cannot dominate outright.
- **Recency** — `Math.exp(-RECENCY_DECAY_RATE * daysSinceLastUse)` with `RECENCY_DECAY_RATE = 0.099` (a 7-day half-life: `ln(2)/7`).
- **Time-of-day boost** — `calculateTimeBoost(hourlyUsage, currentHour)` returns `1 + timeScore * 0.5`, where `timeScore` sums the share of historical usage in a ±2-hour window around the current hour with linear distance decay (`1 - |i|*0.2`). Commands habitually used at this time of day get up to a 1.5× boost; no history yields a neutral `1`.
- **EMA smoothing** — `currentScore = frequency * recency * timeBoost`, then `emaScore = 0.2 * currentScore + 0.8 * previousEma` (`EMA_SMOOTHING_FACTOR = 0.2`). To avoid a cold-start penalty, a brand-new command's EMA is seeded to its current score rather than blended against zero.

`getRankedCommandIds()` recomputes scores for every command with `totalUsage > 0` at the *current* hour and returns ids sorted by descending score. This drives both the root empty-state ordering (`sortSuggestionsByUsage` in `query.ts`) and the search-time `usageBoost`, so ordering shifts with time of day and recency, not just raw counts.

For the search path, `searchIndex.ts` wraps this in `getUsageRankMap()` — a module-cached `commandId → rank` map behind the same ~30 s TTL, cleared on `monocle-commandUsage` writes. Both root and child queries read the cached map, so ranking no longer pays a storage read (and full re-rank) on every keystroke.

### Cleanup

After a recording, if `≥ CLEANUP_INTERVAL_DAYS` (90) have passed since `lastCleanup`, `cleanupOldData` deletes any command whose `lastUsed` is older than 90 days, then stamps `lastCleanup`. This keeps storage bounded; it does not affect ranking otherwise.

## Favorites

Favorites are persisted separately in `background/commands/favorites.ts` under `chrome.storage.local` key `monocle-favoriteCommandIds` — a flat `string[]` of command ids.

- A command becomes a favorite via `toggleFavoriteCommandId(id)` (or `addToFavoriteCommandIds` / `removeFromFavoriteCommandIds`). The user-facing entry point is the generated **Toggle Favorite** action (`toggleFavoriteCommand`, exported here), surfaced in every command's action menu; see [execution-and-actions.md](./execution-and-actions.md). `clearFavoritesCommand` removes the entire key.
- Each suggestion also carries `isFavorite` (set in `commandsToSuggestions` from `favoriteCommandIds.includes(node.id)`) so the UI can show a star and label the toggle correctly.

### How favorites are surfaced

For the root empty state, `getCommandCollections` calls `findFavoritedCommands`, which walks the root tree with the **real page context** — including descending into `group` children (subject to permission checks) — collecting any command whose id is in the favorites list. Favorited nested commands get their name rewritten to `[name, ...parentNames]` so the breadcrumb context shows in the Favorites group. The favorite ids are then excluded from the Suggestions bucket so a favorite is not listed twice.

For search, the index flags entries as `isFavorite`, which gives them tie-break priority and `sourceWeight` 1.0.

Root empty-state ordering is Favorites first, then SDK commands that declared
`placement: "root"`, then the generated site group when grouped SDK commands
exist, then native suggestions sorted by usage.

Child pages do not inherit favorites — `navigateToCommand` sets `favorites: []` on any non-root page (`shared/store/slices/navigation.slice.ts`).

## Deep search

Deep search lets descendants of opted-in groups appear in **root** search results without the user navigating into the group. The flatten lives in the index build (`background/commands/searchIndex.ts`).

### Opting in

A `group` node opts in with `enableDeepSearch: true`. Children groups inherit the flag: `shouldDeepSearch = enableFlag === true || (inheritedDeepSearch && enableFlag !== false)`. So a nested group is flattened automatically once an ancestor enabled deep search, unless it explicitly sets `enableDeepSearch: false`.

SDK groups invert the default at conversion time: grouped site commands are
deep-searchable unless the public command sets `enableDeepSearch: false`.

### Which descendants are flattened

**Only `action` and `submit` descendants.** `input` and `display` rows are intentionally skipped, and groups are recursed into but not themselves emitted as results. This means form-style command groups do not flatten cleanly into root search — do not rely on it.

Each flattened child is enhanced at index time:

- `name` becomes `[childName, ...reversedParentPath]` so the breadcrumb shows where it came from.
- `keywords` are augmented with the lowercased parent path segments and (if a string) the child's description — so typing a parent group's name surfaces its deep-search children.
- `keybinding` resolves from command settings override or the node default.
- The returned `Suggestion` is stamped with `rankWeight = effectiveWeight` (see below).

### Deep search ranking weights

Deep-search entries carry a source multiplier in `DEEP_SEARCH_RANK_WEIGHTS` (`searchIndex.ts`), resolved once from the **root** group id and threaded to all descendants:

| Root group id | Weight |
| --- | --- |
| `bookmarks` | 0.97 |
| `open-tabs` | 0.95 |
| `recently-closed` | 0.8 |
| `history` | 0.7 |
| (any other) | 1.0 (`DEFAULT_DEEP_SEARCH_WEIGHT`) |

The scorer multiplies the weight into the final score, so root commands outrank equally-relevant history/bookmark hits. The ordering also decides same-URL dedupe winners (Pass B below): `bookmarks` sits above `open-tabs` so a bookmarked page that is also open surfaces under its user-given bookmark name rather than the transient tab title — opening it still focuses the existing tab.

### Deduplication and `dedupeKey`

`dedupeEntries` runs two passes at index-build time:

- **Pass A — by entry id.** Collapses identical ids (e.g. a `chrome.history` item that appears in several time-period groups), keeping the highest-weight entry and merging the favorite flag.
- **Pass B — by `dedupeKey`.** For entries that set a `dedupeKey` (typically a URL normalized via `normalizeUrlForDedupe`), only entries from the **highest-weight source** for that key survive. Entries with no `dedupeKey` pass through untouched, and two entries from the *same* source (same weight) with the same key are both kept. This is how the same URL open in tabs vs. present in history collapses to a single row. The survivor **absorbs the dropped entries' name and keywords into its own keywords** (re-tokenized), so the destination stays findable by *every* source's name — e.g. a row kept for a bookmark's name is still matched by the open tab's title, and vice versa. Without this, the losing source's name would become unsearchable. Authors of website/history-style commands should set `dedupeKey` to a normalized URL to participate.

### How deep-search items render

Deep-search matches arrive inline in `search-commands` results, interleaved with root command matches under the single "Results" group. They appear only for root searches (child-page searches score that page's children). Selecting one executes through the normal root resolution path.

## Search command nodes

A `search`-type node (`SearchCommandNode`) is a page whose results are produced server-side from the typed query through its own resolver. This is the right model when result generation requires a live query (remote search, large/dynamic result sets).

Flow:

1. Navigating into the node opens a page with `dynamicChildren: true` (set by `getChildrenCommands.ts`).
2. As the user types, the page's `searchValue` is sent to the background via `get-children-commands` (and on execution via the `executionScope.searchValue`). `dynamicChildren` pages are excluded from the `search-commands` flow.
3. `getCommandPageCommands` detects `pageCommand.type === "search"` and, for a non-empty trimmed search, calls `searchNode.getResults(context, search)`, then URL-filters the results. An empty search yields an empty page (no results shown until the user types). `getResults` errors are caught and produce an empty list.

The background re-fetch for `dynamicChildren` (search) pages is debounced ~250 ms in `shared/hooks/useCommandNavigation.tsx`. With `shouldFilter={false}`, whatever `getResults` returns renders in returned order — return a pre-ordered result set.

## Per-page search state and the CMDK/Redux sync

Each navigation page (`Page` in `navigation.slice.ts`) stores its own `searchValue`, plus background search state: `searchResults?: Suggestion[]`, `searchLoading?: boolean`, and `searchSeq?: number`.

- **`updateSearchValue`** writes the current page's `searchValue`. Clearing the query also clears `searchResults` so the non-search rendering restores instantly. For `dynamicChildren` pages, clearing also resets `commands` to empty.
- **Debounced search dispatch** — a `useEffect` in `useCommandNavigation.tsx` keyed on the Redux `searchValue` dispatches `searchCurrentPage` after ~200 ms for non-empty queries on non-dynamic, non-form pages. A `useRef` seq counter tags each request.
- **Staleness guards** — `searchCurrentPage.fulfilled` applies results only when the page id matches, the echoed `seq` is not older than the last applied one, and the echoed `query` still equals the page's current `searchValue` (mirrors the `refreshRequest` guard used by dynamic pages).
- **Navigating into a child** always starts with `searchValue: ""` (in `navigateToCommand`) so all children show.
- **Navigating back** restores the previous page's `searchValue`. This is done imperatively in `useCommandNavigation.tsx`: it writes `inputElement.value` directly on the `input[cmdk-input]` DOM node and dispatches a synthetic input event, guarded by an `ignoreSearchUpdate` ref so the restore does not get re-saved as a user edit. Because the search dispatch is keyed on the *Redux* value, the DOM poke alone cannot trigger a spurious search — but this DOM sync remains **fragile**: any change to Escape/Backspace/back-navigation/search-restoration must be manually regression-tested in both palette modes.

## Authoring guidance

- **Keywords.** Add `keywords` for synonyms, abbreviations, and terms users would type that are not in the name (e.g. `["shortcut", "hotkey"]` for a keybinding command). The display name scores at 0.8 weight versus 0.2 for keywords/description, so keywords widen *matchability*, not ranking. Keep them lowercase-friendly; matching is case-insensitive.
- **Deep search.** Set `enableDeepSearch: true` on a group only when its `action`/`submit` children are individually useful from root (tabs, bookmarks, history). Do not enable it on groups whose value is the navigation context itself, or whose children are `input`/`display` rows (those won't flatten). Children groups inherit the flag — set `enableDeepSearch: false` on a sub-group to exclude it.
- **`dedupeKey`.** For deep-search children that can collide across sources (same URL in tabs and history), set `dedupeKey` to a normalized URL so Pass B keeps only the highest-weight source. Omit it for inherently unique actions (e.g. restore-window) so they always pass through.
- **Source weight.** New deep-search root groups default to weight 1.0. If a source should rank below ordinary root commands, add it to `DEEP_SEARCH_RANK_WEIGHTS` in `searchIndex.ts`.
- **`doNotAddToRecents`.** Set on `submit` commands that should not affect usage ranking (e.g. one-off form submits whose recurrence is meaningless).
- **Context-dependent children.** The index builds with a URL-free context, so group `children()` that depend on the page URL will not contribute nested entries to root search. Keep such commands reachable through their root row or URL-rule-scoped root commands.

## Known issues / manual test checklist

- Deep search processes `action` and `submit` children only; `input`/`display` are skipped by design — keep this explicit so form-like groups are not expected to flatten.
- The CMDK ↔ Redux search sync (`useCommandNavigation`) pokes the DOM input directly; navigation/Escape/Backspace/search-restoration changes need manual regression in both content overlay and new-tab modes.
- A terminated service worker drops the in-memory index; the first query after a cold start pays the rebuild (mitigated by `warmSearchIndex()` at startup).
- Automated coverage: `searchScore.test.ts` (tier ordering, weights, tie-breaks), `searchIndex.test.ts` (single-resolve walk, dedupe, TTL/invalidation, query-time URL filtering), `searchCommands.test.ts` (root/child paths, limit, seq/query echo, deep-search execution, incremental-narrowing equivalence and full-scan fallback), `navigation.slice.test.ts` (stale-response guards), and `command-system.test.ts` (context-aware loading, favorites, URL-denied search results).

Manual checks (run in **both** content overlay and new-tab modes):

- Open the palette, confirm root Suggestions render in a sensible (usage-influenced) order; execute a command a few times and confirm it rises.
- Type a partial command name and confirm name matches rank above keyword/description-only matches, with results arriving within one debounce.
- Search a term that lives in a deep-search group (a tab title, bookmark name, history URL) and confirm the item appears inline under "Results" and executes from root.
- Clear the query and confirm the Favorites/Suggestions empty state restores instantly.
- Navigate into a child group, type to filter its children via the background, clear to restore all children.
- On a form page (e.g. a settings form), type into the search input and confirm all form fields stay visible.
- Open a `search`-type page, confirm an empty query shows nothing and typing fetches results without a persistent "No results" flash.
- Regression-check Escape, Backspace, back-navigation search restoration, first-item auto-select, arrow keys, inline-input focus, and the action menu.

## Related docs

- [command-schema.md](./command-schema.md) — `keywords`, `enableDeepSearch`, `dedupeKey`, `doNotAddToRecents` field reference.
- [command-types.md](./command-types.md) — `group`, `search`, `action`, `submit` node semantics.
- [execution-and-actions.md](./execution-and-actions.md) — usage recording on execute, favorite/hide generated actions.
- [palette-ui-and-navigation.md](./palette-ui-and-navigation.md) — navigation stack, inline forms, overlay vs new-tab differences.
- [messaging.md](./messaging.md) — `get-commands`, `search-commands`, and `get-children-commands` payloads.
- [authoring-commands.md](./authoring-commands.md) — registering commands and choosing the right node type.
