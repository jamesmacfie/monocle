import type {
  Browser,
  SearchCommandsMessage,
  SearchCommandsResponse,
  Suggestion,
} from "../../shared/types"
import { commandsToSuggestions } from "../commands"
import { getCommandPageCommands, normalizeContext } from "../commands/query"
import {
  buildEphemeralIndexEntries,
  getSearchIndex,
  getUsageRankMap,
  getVisibleEntries,
  type IndexEntry,
} from "../commands/searchIndex"
import { rankEntries } from "../commands/searchScore"
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
// commandsToSuggestions call per distinct permission set, each doing its own
// settings/favorites reads) instead of one call per entry.
const entriesToSuggestions = async (
  entries: IndexEntry[],
  context: Browser.Context,
): Promise<Suggestion[]> => {
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
    const page = await getCommandPageCommands(
      context,
      message.parentPath,
      undefined,
      {
        siteSdk,
      },
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

    scanSet = await buildEphemeralIndexEntries(
      page.commands,
      context,
      page.inheritedPermissions,
    )
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

  return { results, seq: message.seq, query: message.query }
}

export const searchCommands = createMessageHandler(
  handleSearchCommands,
  "Failed to search commands",
)
