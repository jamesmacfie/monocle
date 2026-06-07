# Search and Ranking

This document describes how commands are *found* in Monocle: how the root palette filters and orders suggestions, how usage-based ranking and favorites are computed in the background, how deep search flattens nested commands into the root list, how `search`-type command nodes resolve typed queries server-side, and how per-page search state is preserved during navigation. Two distinct mechanisms are at play and are easy to confuse: the background ranks/selects *which* suggestions to send, and CMDK on the UI side then filters/scores them client-side against the live search string. This doc covers both halves and the seams between them.

## Two-stage model

Searching a command is the product of two independent stages:

1. **Background selection and ordering** (`background/commands/query.ts`, `usage.ts`, `favorites.ts`). On every `get-commands` the background loads context-compatible commands, URL-filters them, splits them into `favorites` / `suggestions` / `deepSearchCommands`, and orders `suggestions` by usage score. The resulting `Suggestion[]` arrays are sent to the UI. The background does **not** apply the user's typed search text to the root list — that string is not even sent with `get-commands`.
2. **Client-side fuzzy filtering** (CMDK + the custom `filter` in `shared/components/Command/CommandPalette.tsx`). The full suggestion set lives in the palette; as the user types, CMDK scores every rendered item against the search string and hides non-matches. The order the background sent is the tie-break order CMDK falls back on when scores are equal.

The exception is `search`-type command pages, where the typed text *is* sent to the background and drives `getResults` server-side. See [Search command nodes](#search-command-nodes).

## Root palette search (client-side filtering)

The root palette renders three buckets, each as a CMDK group or list (`shared/components/Command/CommandList.tsx`):

- **Favorites** — `Command.Group heading="Favorites"`.
- **Suggestions** — `Command.Group heading="Suggestions"`, the usage-ordered root commands.
- **Deep search items** — rendered by `DeepSearchItems` only while a search string is present and only on the root page.

### What CMDK matches against

Each row is a `Command.Item` (`shared/components/Command/CommandItem/index.tsx`) with:

- `value={suggestion.id}` — the stable id is the CMDK value, so focus/selection logic keyed on ids keeps working regardless of display name.
- `keywords={mergedKeywords}` — a constructed token array CMDK scores the search string against.

`mergedKeywords` is built in `CommandItem` (`index.tsx`) in this order, with falsy entries dropped:

| Position | Token | Source |
| --- | --- | --- |
| 0 (primary) | Display name | `suggestion.name[0]` if array, else `suggestion.name` |
| 1..n | Ancestor/breadcrumb names | `suggestion.name.slice(1)` (deep-search items carry reversed parent path here) |
| then | Explicit keywords | `suggestion.keywords` from the command definition |
| then | Description | `suggestion.description` (helps match URLs in bookmark/history rows) |
| then | Keybinding text | `suggestion.keybinding` string |

The order matters because the custom filter treats token `[0]` as the high-weight "primary" and the rest as low-weight context.

### The custom filter

`CommandPalette.tsx` passes a custom `filter(value, search, keywords)` to CMDK. Its scoring:

- Empty search returns `1` for everything (all visible).
- `nameScore = defaultFilter(primary, search)` where `primary = keywords[0]`.
- `restScore = defaultFilter(rest.join(" "), search)` for the remaining tokens.
- `prefixBoost = 0.1` if the primary name starts with the search string (case-insensitive).
- `combined = min(1, nameScore * 0.8 + restScore * 0.2 + prefixBoost)`.
- Final score `= combined * sourceWeight`, where `sourceWeight = rankWeightById.get(value) ?? 1`.

So a hit on the command's own name is worth far more than a hit on its keywords/description, and items whose name prefixes the query get a small bump. The `sourceWeight` term demotes deep-search items from less-trusted sources (see [Deep search ranking](#deep-search-ranking-weights)) below sibling root commands of equal textual relevance. `rankWeightById` is memoized in `CommandPalette` from `items.deepSearchItems[].rankWeight`.

### Background role: query.ts

`background/commands/query.ts` is the selection/ordering layer. Key symbols:

- `getCommandCollections(context, options)` (exported) → `{ favorites, suggestions, deepSearchCommands }` (the node-level collections; the message handler converts them to suggestions). It loads all commands, URL-filters them via `filterCommandsByUrl`, computes favorites, then sorts the remaining suggestions by usage.
- `sortSuggestionsByUsage(commands, excludedCommandIds)` (internal, not exported) — orders by the ranking from `getRankedCommandIds()`; commands with no usage history sort last (`Number.MAX_SAFE_INTEGER`) and otherwise keep their loaded order. Favorited command ids are passed as the `excludedCommandIds` `Set` so they are not duplicated in Suggestions.
- `getCommandPageCommands(...)` / `resolveCommandById` / `resolveCommandInPage` — used for nested pages, search pages, and execution resolution (see [Search command nodes](#search-command-nodes)).

`getCommandCollections` is re-exported through `background/commands/index.ts` as `getCommands`, called by the `get-commands` handler in `background/messages/getCommands.ts`.

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

`getRankedCommandIds()` recomputes scores for every command with `totalUsage > 0` at the *current* hour and returns ids sorted by descending score. This is what `sortSuggestionsByUsage` consumes, so ordering is recomputed on each palette open and shifts with time of day and recency, not just raw counts.

### Cleanup

After a recording, if `≥ CLEANUP_INTERVAL_DAYS` (90) have passed since `lastCleanup`, `cleanupOldData` deletes any command whose `lastUsed` is older than 90 days, then stamps `lastCleanup`. This keeps storage bounded; it does not affect ranking otherwise.

## Favorites

Favorites are persisted separately in `background/commands/favorites.ts` under `chrome.storage.local` key `monocle-favoriteCommandIds` — a flat `string[]` of command ids.

- A command becomes a favorite via `toggleFavoriteCommandId(id)` (or `addToFavoriteCommandIds` / `removeFromFavoriteCommandIds`). The user-facing entry point is the generated **Toggle Favorite** action (`toggleFavoriteCommand`, exported here), surfaced in every command's action menu; see [execution-and-actions.md](./execution-and-actions.md). `clearFavoritesCommand` removes the entire key.
- Each suggestion also carries `isFavorite` (set in `commandsToSuggestions` from `favoriteCommandIds.includes(node.id)`) so the UI can show a star and label the toggle correctly.

### How favorites are surfaced

`getCommandCollections` calls `findFavoritedCommands`, which walks the **entire** root tree — including descending into `group` children (subject to permission checks) — collecting any command whose id is in the favorites list. Favorited nested commands get their name rewritten to `[name, ...parentNames]` so the breadcrumb context shows in the Favorites group. The favorite ids are then excluded from the Suggestions bucket so a favorite is not listed twice.

In `CommandData`, favorites arrive as `favorites: Suggestion[]` (distinct from `suggestions`) and render under the "Favorites" CMDK group. Note child pages do not inherit favorites — `navigateToCommand` sets `favorites: []` on any non-root page (`shared/store/slices/navigation.slice.ts`).

## Deep search

Deep search lets descendants of opted-in groups appear in the **root** search results without the user navigating into the group. It is implemented in `background/messages/getDeepSearchCommands.ts`.

### Opting in

A `group` node opts in with `enableDeepSearch: true`. Children groups inherit the flag: in `collectDeepSearchEntries`, `shouldDeepSearch = enableFlag === true || (inheritedDeepSearch && enableFlag !== false)`. So a nested group is flattened automatically once an ancestor enabled deep search, unless it explicitly sets `enableDeepSearch: false`.

### Which descendants are flattened

**Only `action` and `submit` descendants.** `input` and `display` rows are intentionally skipped, and groups are recursed into but not themselves emitted as results. This means form-style command groups do not flatten cleanly into root search — do not rely on it.

Each flattened child is enhanced before conversion:

- `name` becomes `[childName, ...reversedParentPath]` so the breadcrumb shows where it came from.
- `keywords` are augmented with the lowercased parent path segments and (if a string) the child's description — so typing a parent group's name surfaces its deep-search children.
- `keybinding` resolves from command settings override or the node default.
- The resulting `Suggestion` is stamped with `rankWeight = effectiveWeight` (see below).

### Deep search ranking weights

Deep-search results carry a source multiplier in `DEEP_SEARCH_RANK_WEIGHTS`, resolved once from the **root** group id and threaded to all descendants:

| Root group id | Weight |
| --- | --- |
| `open-tabs` | 0.95 |
| `bookmarks` | 0.85 |
| `recently-closed` | 0.8 |
| `history` | 0.7 |
| (any other) | 1.0 (`DEFAULT_DEEP_SEARCH_WEIGHT`) |

These weights become `Suggestion.rankWeight`, which the palette's custom filter multiplies into the textual score (`combined * sourceWeight`). Root (non-deep-search) commands have no `rankWeight` and default to 1.0, so they outrank equally-relevant history/bookmark hits.

### Deduplication and `dedupeKey`

`dedupeEntries` runs two passes before emitting suggestions:

- **Pass A — by suggestion id.** Collapses identical ids (e.g. a `chrome.history` item that appears in several time-period groups).
- **Pass B — by `dedupeKey`.** For entries that set a `dedupeKey` (typically a normalized URL), only the entry from the **highest-weight source** for that key survives. Entries with no `dedupeKey` pass through untouched, and two entries from the *same* source (same weight) with the same key are both kept. This is how the same URL open in tabs vs. present in history collapses to the tab (higher weight) result. Authors of website/history-style commands should set `dedupeKey` to a normalized URL to participate.

### How and when deep-search items render

- The background returns `deepSearchItems: Suggestion[]` on `get-commands` (`flattenDeepSearchCommands` is called from `getCommands.ts` against the `deepSearchCommands` collection). This is the only live path. `getDeepSearchCommands.ts` also exports a standalone `getDeepSearchCommands()` helper that flattens with an empty context, but it is not wired to a registered message handler — treat it as a convenience/legacy export, not an active message.
- The UI stores them in `navigation` state `initialCommands.deepSearchItems` and passes them to `CommandList` → `DeepSearchItems`.
- `DeepSearchItems` renders **only** when both: there is a non-empty CMDK `search` value, and the current page has no `parent` (i.e. root page). When the search is cleared or you navigate into a child page, deep-search items vanish. They are appended *after* Favorites and Suggestions, and CMDK's filter (with the source weight) decides which actually show.

## Search command nodes

A `search`-type node (`SearchCommandNode`) is a page whose results are produced server-side from the typed query, not client-filtered. This is the right model when result generation requires a live query (remote search, large/dynamic result sets).

Flow:

1. Navigating into the node opens a page with `dynamicChildren: true` (set by `getChildrenCommands.ts`).
2. As the user types, the page's `searchValue` is sent to the background via `get-children-commands` (and on execution via the `executionScope.searchValue`).
3. `getCommandPageCommands` detects `pageCommand.type === "search"` and, for a non-empty trimmed search, calls `searchNode.getResults(context, search)`, then URL-filters the results. An empty search yields an empty page (no results shown until the user types). `getResults` errors are caught and produce an empty list.

The background re-fetch for `dynamicChildren` (search) pages **is debounced ~250 ms**: a `useEffect` in `shared/hooks/useCommandNavigation.tsx` keyed on the page's `searchValue` dispatches `refreshCurrentPageThunk` after a 250 ms `setTimeout`, so rapid typing coalesces into one request. Separately, `CommandList` (`isTyping`) keeps a 250 ms typing indicator that suppresses the "No results" flash while a query is in flight.

Because results are already query-specific, CMDK still client-filters them too; `getResults` should return the candidate set for the query and let CMDK do final ordering, or return a pre-ordered set knowing CMDK will re-score.

## Per-page search state and the CMDK/Redux sync

Each navigation page (`Page` in `navigation.slice.ts`) stores its own `searchValue`. Important behaviors:

- **`updateSearchValue`** writes the current page's `searchValue`. For `dynamicChildren` pages, clearing the search to empty also resets `commands` to empty (search-driven pages show nothing without a query).
- **Navigating into a child** always starts with `searchValue: ""` (in `navigateToCommand`) so all children show.
- **Navigating back** restores the previous page's `searchValue`. This is done imperatively in `shared/hooks/useCommandNavigation.tsx`: it writes `inputElement.value` directly on the `input[cmdk-input]` DOM node and dispatches a synthetic input event, guarded by an `ignoreSearchUpdate` ref so the restore does not get re-saved as a user edit. This DOM-poking sync between CMDK's internal search state and Redux is **fragile** — any change to Escape/Backspace/back-navigation/search-restoration must be manually regression-tested in both palette modes.
- CMDK is the source of truth for the *live* search string used in filtering (`useCommandState(s => s.search)`); Redux `searchValue` is the persisted per-page value. The two are kept in lockstep manually, which is the main fragility in this area.

## Authoring guidance

- **Keywords.** Add `keywords` for synonyms, abbreviations, and terms users would type that are not in the name (e.g. `["shortcut", "hotkey"]` for a keybinding command). The display name already scores highest; keywords/description score at 0.2 weight, so keywords widen *matchability*, not ranking. Keep them lowercase-friendly; CMDK is case-insensitive.
- **Deep search.** Set `enableDeepSearch: true` on a group only when its `action`/`submit` children are individually useful from root (tabs, bookmarks, history). Do not enable it on groups whose value is the navigation context itself, or whose children are `input`/`display` rows (those won't flatten). Children groups inherit the flag — set `enableDeepSearch: false` on a sub-group to exclude it.
- **`dedupeKey`.** For deep-search children that can collide across sources (same URL in tabs and history), set `dedupeKey` to a normalized URL so Pass B keeps only the highest-weight source. Omit it for inherently unique actions (e.g. restore-window) so they always pass through.
- **Source weight.** New deep-search root groups default to weight 1.0. If a source should rank below ordinary root commands, add it to `DEEP_SEARCH_RANK_WEIGHTS`.
- **`doNotAddToRecents`.** Set on `submit` commands that should not affect usage ranking (e.g. one-off form submits whose recurrence is meaningless).

## Known issues / manual test checklist

Carried forward from the prior command-system baseline and verified against code:

- Deep search processes `action` and `submit` children only; `input`/`display` are skipped by design — keep this explicit so form-like groups are not expected to flatten.
- The CMDK ↔ Redux search sync (`useCommandNavigation`) pokes the DOM input directly; navigation/Escape/Backspace/search-restoration changes need manual regression in both content overlay and new-tab modes.
- Automated coverage is narrow (`background/commands/command-system.test.ts` covers context-aware loading, usage ranking, `doNotAddToRecents`, generated actions across scopes, deep search with favorites, favorited child context). UI/component filtering behavior is not unit-tested.

Manual checks:

- Open the palette, confirm root Suggestions render in a sensible (usage-influenced) order; execute a command a few times and confirm it rises.
- Type a partial command name and confirm name matches rank above keyword/description-only matches.
- Search a term that lives in a deep-search group (e.g. an open tab's title) and confirm the nested item appears under the search results and can execute from root.
- Confirm deep-search items disappear when the search is cleared and when you navigate into a child page.
- Favorite a nested command and confirm it appears under Favorites with breadcrumb context after refresh; clear it and confirm it disappears.
- Open a `search`-type page (if available), confirm an empty query shows nothing and typing fetches results without a persistent "No results" flash.

## Related docs

- [command-schema.md](./command-schema.md) — `keywords`, `enableDeepSearch`, `dedupeKey`, `doNotAddToRecents` field reference.
- [command-types.md](./command-types.md) — `group`, `search`, `action`, `submit` node semantics.
- [execution-and-actions.md](./execution-and-actions.md) — usage recording on execute, favorite/hide generated actions.
- [palette-ui-and-navigation.md](./palette-ui-and-navigation.md) — navigation stack, inline forms, overlay vs new-tab differences.
- [messaging.md](./messaging.md) — `get-commands` and `get-children-commands` payloads.
- [authoring-commands.md](./authoring-commands.md) — registering commands and choosing the right node type.
