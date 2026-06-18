// Architecture: background feature layer (Native Messaging bridge). Builds
// suggestions for the browser's active tab by REUSING the existing command query
// and search paths — the bridge is an adapter, not a parallel implementation.
// Resolves the active tab (requires the `tabs` permission for url/title; skips
// incognito), runs the same getCommands / search scoring the palette uses, and
// projects the result to the public ExternalSuggestion DTO. Site-SDK commands
// are absent (no content-script sender) — a documented v1 gap. See
// docs/native-messaging/architecture.md.
import type {
  Browser,
  ExternalSuggestion,
  SearchCommandsResponse,
  Suggestion,
} from "../../../shared/types"
import { allCommands, commandsToSuggestions, getCommands } from "../../commands"
import { searchCommands } from "../../messages/searchCommands"
import { getActiveTab } from "../../utils/browser"
import { toExternalSuggestions } from "./externalSuggestion"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

// Commands opted out of the bridge (`external.allowed: false`) are neither
// listed nor runnable. `allowed` is a static property of the command definition,
// so the denied-id set is computed once from the context-free command list.
// (Covers the top-level commands that carry the flag — the only ones annotated;
// deep-searched dynamic descendants are data rows that never set it.)
let deniedIdsCache: Set<string> | null = null
const bridgeDeniedIds = (): Set<string> => {
  if (!deniedIdsCache) {
    deniedIdsCache = new Set(
      allCommands
        .filter((command) => command.external?.allowed === false)
        .map((command) => command.id),
    )
  }
  return deniedIdsCache
}

type ActiveTabResult = {
  url: string
  title: string
  suggestions: ExternalSuggestion[]
}

export type GetForActiveTabParams = {
  limit?: number
  includeFavorites?: boolean
}

export type SearchActiveTabParams = {
  query: string
  limit?: number
}

const clampLimit = (limit?: number): number =>
  Math.min(Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT)), MAX_LIMIT)

// Resolves the active tab into its tab object + a Browser.Context, or null when
// there is none / it is incognito (excluded). Shared by suggestions and command
// execution so both use the same active-tab resolution. The tab carries
// `windowId` (used by execute to raise the browser for focus-and-act commands).
export const resolveActiveTab = async (): Promise<{
  tab: { id?: number; windowId?: number; url?: string; title?: string }
  context: Browser.Context
} | null> => {
  const tab = await getActiveTab()
  if (!tab || tab.incognito) {
    return null
  }
  return {
    tab,
    context: {
      url: tab.url ?? "",
      title: tab.title ?? "",
      modifierKey: null,
    },
  }
}

const resolveActiveContext = async (): Promise<Browser.Context | null> => {
  const resolved = await resolveActiveTab()
  return resolved?.context ?? null
}

export const getForActiveTab = async (
  params: GetForActiveTabParams,
): Promise<ActiveTabResult | null> => {
  const context = await resolveActiveContext()
  if (!context) {
    return null
  }

  const limit = clampLimit(params.limit)
  const includeFavorites = params.includeFavorites ?? true

  const { favorites, suggestions } = await getCommands(context)
  const commands = (
    includeFavorites ? [...favorites, ...suggestions] : suggestions
  ).filter((command) => command.external?.allowed !== false)

  const rows: Suggestion[] = await commandsToSuggestions(commands, context)
  return {
    url: context.url,
    title: context.title,
    suggestions: toExternalSuggestions(rows).slice(0, limit),
  }
}

export const searchActiveTab = async (
  params: SearchActiveTabParams,
): Promise<(ActiveTabResult & { query: string }) | null> => {
  const context = await resolveActiveContext()
  if (!context) {
    return null
  }

  const limit = clampLimit(params.limit)

  // Reuse the per-keystroke search handler (index scoring + calculations). No
  // sender → no site-SDK scope, matching the v1 gap.
  const response = (await searchCommands(
    {
      type: "monocle-commands-search",
      context,
      query: params.query,
      seq: 0,
      limit,
    },
    undefined,
  )) as SearchCommandsResponse | { error: string }

  const denied = bridgeDeniedIds()
  const results = ("results" in response ? response.results : []).filter(
    (suggestion) => !denied.has(suggestion.id),
  )
  return {
    url: context.url,
    title: context.title,
    query: params.query,
    suggestions: toExternalSuggestions(results).slice(0, limit),
  }
}
