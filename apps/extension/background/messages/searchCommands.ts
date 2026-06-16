import type {
  Browser,
  SearchCommandsMessage,
  SearchCommandsResponse,
  Suggestion,
} from "../../shared/types"
import { runCalculationProviders } from "../calculations"
import { commandsToSuggestions } from "../commands"
import { getFavoriteCommandIds } from "../commands/favorites"
import { normalizeContext } from "../commands/query"
import {
  getChildPageSearchData,
  getSearchIndex,
  getUsageRankMap,
  getVisibleEntries,
  type IndexEntry,
} from "../commands/searchIndex"
import { rankEntries } from "../commands/searchScore"
import { getAllCommandSettings } from "../commands/settings"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { createMessageHandler } from "../utils/messages"

const DEFAULT_RESULT_LIMIT = 40

// Incremental narrowing state for root search. Typing is append-only on the
// common path, and every scoring tier (exact/prefix/word-boundary/substring/
// subsequence) is monotonic under appending: if a query scores zero for an
// entry, any extension of that query also scores zero. So the match set for
// `prev + chars` is always a subset of the match set for `prev`, and we can
// re-score just the prior matches instead of the full visible index.
//
// `base` is the URL-filtered array identity we narrowed from; when the index
// rebuilds or the URL changes, getVisibleEntries returns a different array and
// the identity check forces a full rescan. `candidates` holds *all* matched
// entries (not the sliced top-N), so entries that only surface as competitors
// drop out aren't lost as the query grows. Module state is shared across tabs;
// a mismatch simply falls back to a full scan, never a wrong result.
let lastRootSearch: {
  base: IndexEntry[]
  query: string
  candidates: IndexEntry[]
} | null = null

// Converts entries to suggestions while preserving entry order. Entries are
// grouped by their inherited-permission set so conversion stays batched (one
// commandsToSuggestions call per distinct permission set). Favorites and
// settings are read once here and threaded into every batch instead of each
// batch paying its own storage reads.
const entriesToSuggestions = async (
  entries: IndexEntry[],
  context: Browser.Context,
): Promise<Suggestion[]> => {
  const [favoriteCommandIds, commandSettings] = await Promise.all([
    getFavoriteCommandIds(),
    getAllCommandSettings(),
  ])
  const preloaded = {
    favoriteCommandIds: new Set(favoriteCommandIds),
    commandSettings,
  }

  const groups = new Map<
    string,
    { permissions: IndexEntry["inheritedPermissions"]; indexes: number[] }
  >()

  entries.forEach((entry, index) => {
    const key = [...entry.inheritedPermissions].sort().join(",")
    const group = groups.get(key)
    if (group) {
      group.indexes.push(index)
    } else {
      groups.set(key, {
        permissions: entry.inheritedPermissions,
        indexes: [index],
      })
    }
  })

  const results: Suggestion[] = new Array(entries.length)

  await Promise.all(
    [...groups.values()].map(async ({ permissions, indexes }) => {
      const suggestions = await commandsToSuggestions(
        indexes.map((index) => entries[index].command),
        context,
        undefined,
        permissions,
        preloaded,
      )

      suggestions.forEach((suggestion, position) => {
        const index = indexes[position]
        const entry = entries[index]
        results[index] = entry.fromDeepSearch
          ? { ...suggestion, rankWeight: entry.sourceWeight }
          : suggestion
      })
    }),
  )

  return results
}

/**
 * Per-keystroke search handler. Root search scores against the cached, URL-
 * filtered index — narrowing from the prior query's match set when the new
 * query merely extends it (see lastRootSearch) and refreshing that cache with
 * the full matched superset (not the sliced top-N) so a later character can
 * still narrow correctly. Child-page search scores ephemeral entries built from
 * the page's (TTL-cached) children. Only the returned top-N are converted to
 * Suggestions, so action-menu construction never runs over the whole index.
 * The empty-query root case is owned by get-commands, not here.
 */
const handleSearchCommands = async (
  message: SearchCommandsMessage,
  sender?: any,
): Promise<SearchCommandsResponse> => {
  const context = normalizeContext(message.context)
  const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
  const queryLower = message.query.trim().toLowerCase()
  const limit = message.limit ?? DEFAULT_RESULT_LIMIT
  const isRootSearch = !message.parentPath || message.parentPath.length === 0

  // The set we hand to rankEntries. For root search it's the visible index
  // (or the prior query's matches, when narrowing applies); for child search
  // it's the page's ephemeral entries.
  let scanSet: IndexEntry[]
  // The full URL-filtered base for root search, captured so we can refresh the
  // narrowing cache after scoring. null for child search (never cached).
  let rootBase: IndexEntry[] | null = null

  if (isRootSearch) {
    // Root empty state is served by get-commands, not here
    if (!queryLower) {
      lastRootSearch = null
      return { results: [], seq: message.seq, query: message.query }
    }

    const index = await getSearchIndex(context, { siteSdk })
    rootBase = getVisibleEntries(index, context.url || "")

    // Narrow to the prior query's matches when this query extends it against
    // the same base. Otherwise score the full visible base.
    scanSet =
      lastRootSearch &&
      lastRootSearch.base === rootBase &&
      lastRootSearch.query.length > 0 &&
      queryLower.startsWith(lastRootSearch.query)
        ? lastRootSearch.candidates
        : rootBase
  } else {
    // Cached across the keystrokes of one search burst — children don't
    // change between the keystrokes of a single query, so the chrome API
    // fetch + match-text resolution run once per page per TTL, not per
    // keystroke.
    const { page, entries } = await getChildPageSearchData(
      context,
      message.parentPath ?? [],
      { siteSdk },
    )

    // Empty child query: all children in load order
    if (!queryLower) {
      const results = await commandsToSuggestions(
        page.commands,
        context,
        undefined,
        page.inheritedPermissions,
      )
      return { results, seq: message.seq, query: message.query }
    }

    scanSet = entries
  }

  const usageRank = await getUsageRankMap()
  const ranked = rankEntries(scanSet, queryLower, usageRank)

  // Cache the full matched set (not the sliced top-N) so the next appended
  // character can narrow from a correct superset.
  if (rootBase) {
    lastRootSearch = {
      base: rootBase,
      query: queryLower,
      candidates: ranked.map((scored) => scored.entry),
    }
  }

  const topEntries = ranked.slice(0, limit).map((scored) => scored.entry)

  // Suggestions (with eager action menus) are built only for the returned
  // top-N — never for the whole index.
  const results = await entriesToSuggestions(topEntries, context)

  // Inline calculations run only at the root query: every provider parses the
  // raw query and any non-null results are prepended as ephemeral rows. They
  // are not commands, so they bypass favorites, usage ranking, and the index.
  // A query no provider parses simply yields none. See docs/calculations.md.
  if (isRootSearch) {
    const calculations = runCalculationProviders(message.query, context)
    if (calculations.length > 0) {
      return {
        results: [...calculations, ...results],
        seq: message.seq,
        query: message.query,
      }
    }
  }

  return { results, seq: message.seq, query: message.query }
}

export const searchCommands = createMessageHandler(
  handleSearchCommands,
  "Failed to search commands",
)
