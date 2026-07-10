// Architecture: background command system. Search-index cache lifecycle and
// query state. The pure tree resolve/dedupe build lives in searchIndexBuild.ts.
// Entries remain URL-free and visibility is applied cheaply at query time.
import type {
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
} from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { isCommandVisibleForUrl } from "../utils/urlFilter"
import { getFavoriteCommandIds } from "./favorites"
import { getPlatform } from "./platform"
import { getCommandPageCommands } from "./query"
import {
  type BuildShared,
  buildSearchIndex,
  createEntry,
  type IndexEntry,
} from "./searchIndexBuild"
import { getAllCommandSettings } from "./settings"
import type { CommandLoadOptions } from "./source"
import { toUrlRuleChainLink } from "./traversal"
import { getRankedCommandIds } from "./usage"

export type { IndexEntry } from "./searchIndexBuild"
export { DEEP_SEARCH_RANK_WEIGHTS } from "./searchIndexBuild"

const INDEX_TTL_MS = 30_000

export type SearchIndex = {
  entries: IndexEntry[]
  builtAt: number
  contextKey: string
  // Command settings read once at build time so the per-keystroke query path
  // doesn't re-read storage for URL filtering. Refreshed on rebuild, which the
  // invalidation listener triggers on any monocle-settings change.
  commandSettings: Record<string, CommandSettings>
}

let cachedIndex: SearchIndex | null = null
let inflightBuild: {
  contextKey: string
  promise: Promise<SearchIndex>
} | null = null

// Stale-while-revalidate: the last good index, retained across invalidation
// and TTL expiry so the query that triggers a rebuild can be served
// immediately from slightly stale data instead of blocking on the rebuild.
// Bounded by STALE_SERVE_LIMIT_MS; cleared whenever a fresh build lands.
let staleIndex: SearchIndex | null = null
const STALE_SERVE_LIMIT_MS = 30_000 * 4

// Memoized URL-filtered view of the current index. The URL doesn't change
// between keystrokes, so the full rule-chain scan runs once per (index, url)
// rather than every query. Keyed by index identity + url; a rebuild produces a
// new index object and drops this cache implicitly.
let visibleCache: {
  index: SearchIndex
  url: string
  entries: IndexEntry[]
} | null = null

// Module-cached usage rank map. Usage is a ranking tie-breaker, so a ~30s TTL
// backstop plus monocle-commandUsage storage invalidation keeps it off the
// per-keystroke path without meaningfully staling results.
let cachedUsageRank: {
  map: Map<string, number>
  builtAt: number
} | null = null

const getContextKey = (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): string => {
  const siteSdkKey = options?.siteSdk
    ? `|site:${options.siteSdk.scopeKey}:${options.siteSdk.revision}:${context?.url ?? ""}`
    : ""
  return `${context?.isNewTab ? "newtab" : "page"}|${getPlatform(options)}${siteSdkKey}`
}

export const getSearchIndex = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<SearchIndex> => {
  const contextKey = getContextKey(context, options)

  if (
    cachedIndex &&
    cachedIndex.contextKey === contextKey &&
    Date.now() - cachedIndex.builtAt < INDEX_TTL_MS
  ) {
    return cachedIndex
  }

  // TTL-expired cache becomes the stale-serve candidate just like an
  // invalidated one.
  if (cachedIndex && cachedIndex.contextKey === contextKey) {
    staleIndex = cachedIndex
    cachedIndex = null
  }

  if (inflightBuild && inflightBuild.contextKey === contextKey) {
    // A rebuild is already running; serve stale instead of blocking on it.
    const servable = getServableStaleIndex(contextKey)
    if (servable) {
      return servable
    }
    return await inflightBuild.promise
  }

  const promise = (async (): Promise<SearchIndex> => {
    const { entries, commandSettings } = await buildSearchIndex(
      context,
      options,
    )
    const index: SearchIndex = {
      entries,
      builtAt: Date.now(),
      contextKey,
      commandSettings,
    }
    cachedIndex = index
    // Fresh data landed — never fall back to the older snapshot again.
    staleIndex = null
    return index
  })()

  inflightBuild = { contextKey, promise }

  const finalize = () => {
    if (inflightBuild?.promise === promise) {
      inflightBuild = null
    }
  }

  // Stale-while-revalidate: answer this query from the last good index and
  // let the rebuild finish in the background. One debounce window of
  // staleness (e.g. a just-closed tab still listed) is the documented
  // trade-off; suggestions held in an open palette already outlive their
  // tabs today, so this is not a new failure mode.
  const servable = getServableStaleIndex(contextKey)
  if (servable) {
    promise
      .catch((error) => {
        console.error("[SearchIndex] Background rebuild failed:", error)
      })
      .finally(finalize)
    return servable
  }

  try {
    return await promise
  } finally {
    finalize()
  }
}

const getServableStaleIndex = (contextKey: string): SearchIndex | null => {
  if (
    staleIndex &&
    staleIndex.contextKey === contextKey &&
    Date.now() - staleIndex.builtAt < STALE_SERVE_LIMIT_MS
  ) {
    return staleIndex
  }
  return null
}

// retainStale opts the invalidation into stale-while-revalidate: the next
// query is served from the outgoing index while the rebuild runs. That is only
// safe for browser-data churn (tabs/history/bookmarks/sessions), where one
// debounce window of staleness is cosmetic. Settings, favorites, permission,
// and site-SDK invalidations use the default and drop the snapshot — hiding a
// command or denying a domain must take effect on the very next query.
export const invalidateSearchIndex = (options?: {
  retainStale?: boolean
}): void => {
  staleIndex = options?.retainStale ? (cachedIndex ?? staleIndex) : null
  cachedIndex = null
  inflightBuild = null
  visibleCache = null
  // Child pages never serve stale: their fetches are cheap relative to a full
  // index rebuild, and dynamic children (tabs, history) should refresh on the
  // events that land here.
  childPageCache.clear()
}

// Full reset including the stale-while-revalidate snapshot; used by tests to
// guarantee the next query rebuilds from scratch.
export const dropSearchIndexCaches = (): void => {
  invalidateSearchIndex()
}

// Usage rank as a `commandId -> rank` map, module-cached behind the index TTL.
// Used by every query path so ranking no longer pays a storage read per
// keystroke. Invalidated on monocle-commandUsage writes.
export const getUsageRankMap = async (): Promise<Map<string, number>> => {
  if (cachedUsageRank && Date.now() - cachedUsageRank.builtAt < INDEX_TTL_MS) {
    return cachedUsageRank.map
  }

  const rankedCommandIds = await getRankedCommandIds()
  const map = new Map<string, number>()
  rankedCommandIds.forEach((id, index) => map.set(id, index))

  cachedUsageRank = { map, builtAt: Date.now() }
  return map
}

const invalidateUsageRank = (): void => {
  cachedUsageRank = null
}

// Memoized URL-filtered entry set for the current index. Reuses the index's
// own commandSettings so the query path needs no extra storage read.
export const getVisibleEntries = (
  index: SearchIndex,
  currentUrl: string,
): IndexEntry[] => {
  const url = currentUrl || ""

  if (
    visibleCache &&
    visibleCache.index === index &&
    visibleCache.url === url
  ) {
    return visibleCache.entries
  }

  const entries = filterIndexEntriesByUrl(
    index.entries,
    url,
    index.commandSettings,
  )
  visibleCache = { index, url, entries }
  return entries
}

// Query-time URL visibility: an entry is visible when every link in its rule
// chain (ancestors + self) allows the current URL.
export const filterIndexEntriesByUrl = (
  entries: IndexEntry[],
  currentUrl: string,
  commandSettings: Record<string, CommandSettings>,
): IndexEntry[] => {
  return entries.filter((entry) =>
    entry.urlRuleChain.every((link) =>
      isCommandVisibleForUrl(link, currentUrl, commandSettings[link.id]),
    ),
  )
}

// Child command pages are not pre-indexed: build ephemeral entries from an
// already URL-filtered child command list (getCommandPageCommands output) so
// the same scorer runs over them. Match fields resolve with the real context.
export const buildEphemeralIndexEntries = async (
  commands: CommandNode[],
  context: Browser.Context,
  inheritedPermissions: BrowserPermission[],
): Promise<IndexEntry[]> => {
  const commandSettings = await getAllCommandSettings()
  const favoriteCommandIds = new Set(await getFavoriteCommandIds())

  const shared: BuildShared = {
    context,
    commandSettings,
    favoriteCommandIds,
    entries: [],
  }

  return await Promise.all(
    commands.map((command) =>
      createEntry(
        {
          command,
          breadcrumb: [],
          sourceWeight: 1,
          fromDeepSearch: false,
          inheritedPermissions,
          urlRuleChain: [toUrlRuleChainLink(command)],
        },
        shared,
      ),
    ),
  )
}

type ChildPage = Awaited<ReturnType<typeof getCommandPageCommands>>

type ChildPageCacheEntry = {
  page: ChildPage
  entries: IndexEntry[]
  builtAt: number
}

// Child-page search refetches the page's children (live chrome API calls for
// dynamic groups) and re-resolves match text on every keystroke without this
// cache. The TTL is a typing-burst horizon — deliberately shorter than the
// index TTL — and the cache inherits the index's freshness contract: every
// invalidateSearchIndex() clears it. The key includes the URL because page
// children are URL-filtered at fetch time.
const CHILD_PAGE_TTL_MS = 15_000
const MAX_CHILD_PAGE_CACHE = 8
const childPageCache = new Map<string, ChildPageCacheEntry>()

const getChildPageKey = (
  context: Browser.Context,
  parentPath: string[],
  options?: CommandLoadOptions,
): string =>
  `${getContextKey(context, options)}|${context.url ?? ""}|${parentPath.join(" ")}`

export const getChildPageSearchData = async (
  context: Browser.Context,
  parentPath: string[],
  options?: CommandLoadOptions,
): Promise<{ page: ChildPage; entries: IndexEntry[] }> => {
  const key = getChildPageKey(context, parentPath, options)
  const cached = childPageCache.get(key)

  if (cached && Date.now() - cached.builtAt < CHILD_PAGE_TTL_MS) {
    return { page: cached.page, entries: cached.entries }
  }

  const page = await getCommandPageCommands(
    context,
    parentPath,
    undefined,
    options,
  )
  const entries = await buildEphemeralIndexEntries(
    page.commands,
    context,
    page.inheritedPermissions,
  )

  if (childPageCache.size >= MAX_CHILD_PAGE_CACHE) {
    const oldestKey = childPageCache.keys().next().value
    if (oldestKey !== undefined) {
      childPageCache.delete(oldestKey)
    }
  }
  childPageCache.set(key, { page, entries, builtAt: Date.now() })

  return { page, entries }
}

// Wire browser events that change command sources or visibility. Settings and
// favorites mutations are covered via storage.onChanged (both write
// chrome.storage.local), which avoids import cycles with settings.ts and
// favorites.ts. Every listener is existence-guarded for Firefox.
export const initializeSearchIndexInvalidation = (): void => {
  const api = getBrowserAPI()
  // Browser-data churn (tabs/history/bookmarks/sessions) retains the outgoing
  // index for stale-while-revalidate serving; permission and settings changes
  // alter visibility and must drop it (see invalidateSearchIndex).
  const invalidateBrowserData = () =>
    invalidateSearchIndex({ retainStale: true })
  const invalidateVisibility = () => invalidateSearchIndex()

  api.tabs?.onCreated?.addListener(invalidateBrowserData)
  api.tabs?.onRemoved?.addListener(invalidateBrowserData)
  // onUpdated fires for loading-status and favicon changes too; only URL and
  // title participate in tab-entry match text, so only those invalidate.
  api.tabs?.onUpdated?.addListener(
    (_tabId: number, changeInfo: { url?: string; title?: string }) => {
      if (changeInfo.url !== undefined || changeInfo.title !== undefined) {
        invalidateBrowserData()
      }
    },
  )
  // No onActivated listener: switching tabs changes neither the tab set nor
  // any match text. The only active-tab-derived index data is the openTabs
  // rows' color highlight, frozen at build time and bounded by the 30s TTL —
  // a cosmetic trade-off accepted deliberately.
  api.history?.onVisited?.addListener(invalidateBrowserData)
  api.history?.onVisitRemoved?.addListener(invalidateBrowserData)
  api.bookmarks?.onCreated?.addListener(invalidateBrowserData)
  api.bookmarks?.onRemoved?.addListener(invalidateBrowserData)
  api.bookmarks?.onChanged?.addListener(invalidateBrowserData)
  api.bookmarks?.onMoved?.addListener(invalidateBrowserData)
  api.sessions?.onChanged?.addListener(invalidateBrowserData)
  api.permissions?.onAdded?.addListener(invalidateVisibility)
  api.permissions?.onRemoved?.addListener(invalidateVisibility)
  api.storage?.onChanged?.addListener(
    (changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== "local") {
        return
      }

      if (
        "monocle-settings" in changes ||
        "monocle-favoriteCommandIds" in changes
      ) {
        invalidateSearchIndex()
      }

      // Usage rank has its own lighter cache: refresh it without rebuilding the
      // whole index (usage writes happen on every command execution).
      if ("monocle-commandUsage" in changes) {
        invalidateUsageRank()
      }
    },
  )
}

// Warm the index at service-worker startup so the first palette query after a
// cold start doesn't pay the full tree resolve.
export const warmSearchIndex = (): void => {
  getSearchIndex().catch((error) => {
    console.error("[SearchIndex] Failed to warm search index:", error)
  })
}
