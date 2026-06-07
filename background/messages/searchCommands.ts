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
  filterIndexEntriesByUrl,
  getSearchIndex,
  type IndexEntry,
} from "../commands/searchIndex"
import { rankEntries } from "../commands/searchScore"
import { getAllCommandSettings } from "../commands/settings"
import { getRankedCommandIds } from "../commands/usage"
import { createMessageHandler } from "../utils/messages"

const DEFAULT_RESULT_LIMIT = 40

const buildUsageRankMap = async (): Promise<Map<string, number>> => {
  const rankedCommandIds = await getRankedCommandIds()
  const usageRank = new Map<string, number>()

  rankedCommandIds.forEach((id, index) => {
    usageRank.set(id, index)
  })

  return usageRank
}

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
): Promise<SearchCommandsResponse> => {
  const context = normalizeContext(message.context)
  const queryLower = message.query.trim().toLowerCase()
  const limit = message.limit ?? DEFAULT_RESULT_LIMIT
  const isRootSearch = !message.parentPath || message.parentPath.length === 0

  let entries: IndexEntry[]

  if (isRootSearch) {
    // Root empty state is served by get-commands, not here
    if (!queryLower) {
      return { results: [], seq: message.seq, query: message.query }
    }

    const [index, commandSettings] = await Promise.all([
      getSearchIndex(context),
      getAllCommandSettings(),
    ])

    entries = filterIndexEntriesByUrl(
      index.entries,
      context.url || "",
      commandSettings,
    )
  } else {
    const page = await getCommandPageCommands(context, message.parentPath)

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

    entries = await buildEphemeralIndexEntries(
      page.commands,
      context,
      page.inheritedPermissions,
    )
  }

  const usageRank = await buildUsageRankMap()
  const topEntries = rankEntries(entries, queryLower, usageRank)
    .slice(0, limit)
    .map((scored) => scored.entry)

  // Suggestions (with eager action menus) are built only for the returned
  // top-N — never for the whole index.
  const results = await entriesToSuggestions(topEntries, context)

  return { results, seq: message.seq, query: message.query }
}

export const searchCommands = createMessageHandler(
  handleSearchCommands,
  "Failed to search commands",
)
