// In-memory search index for background-owned palette search.
//
// Module-scoped cache (same service-worker lifetime pattern as
// background/keybindings/registry.ts), keyed by isNewTab|platform only — NOT
// by URL. Entries are stored pre-URL-filter and carry their command/ancestor
// URL rules so visibility is applied cheaply at query time; the cache
// survives page navigation. Invalidation: ~30s TTL backstop plus browser
// events wired in initializeSearchIndexInvalidation().
//
// Building the index is the single resolve pass that replaces the previous
// per-get-commands tree walks: settings and favorites are read once, and each
// group's children() is called exactly once, shared by favorites collection
// and deep-search flattening.
import type {
  ActionCommandNode,
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  GroupCommandNode,
  SubmitCommandNode,
  UrlRules,
} from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import {
  allowsKeybinding,
  resolveAsyncProperty,
  resolveCommandName,
} from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { isCommandVisibleForUrl } from "../utils/urlFilter"
import { getFavoriteCommandIds } from "./favorites"
import { getPlatform } from "./platform"
import { mergePermissions } from "./query"
import { computeScorableTokens } from "./searchScore"
import { getAllCommandSettings } from "./settings"
import { type CommandLoadOptions, loadAllCommands } from "./source"
import { getRankedCommandIds } from "./usage"

// Source-based ranking multipliers for deep-search entries. Root commands are
// implicitly 1.0.
export const DEEP_SEARCH_RANK_WEIGHTS: Record<string, number> = {
  "open-tabs": 0.95,
  bookmarks: 0.85,
  "recently-closed": 0.8,
  history: 0.7,
}
const DEFAULT_DEEP_SEARCH_WEIGHT = 1

const INDEX_TTL_MS = 30_000

type UrlRuleChainLink = {
  id: string
  urlRules?: UrlRules
}

export type IndexEntry = {
  id: string
  // Resolved node ref. Deep-search entries hold the enhanced node (breadcrumb
  // name array, merged keywords, settings keybinding) so query-time
  // suggestion conversion matches the previous flatten output.
  command: CommandNode
  nameLower: string
  // Reversed parent path: [immediate parent, ..., root]
  breadcrumbLower: string[]
  keywordsLower: string[]
  descriptionLower: string
  keybindingLower: string
  // Build-time tokenization consumed by searchScore (see computeScorableTokens).
  nameWords: string[]
  restFields: string[]
  restWords: string[][]
  // 1.0 for root/favorite entries; DEEP_SEARCH_RANK_WEIGHTS for flattened items
  sourceWeight: number
  dedupeKey?: string
  isFavorite: boolean
  // Permissions inherited from ancestor groups (the entry node's own
  // permissions are merged during suggestion conversion).
  inheritedPermissions: BrowserPermission[]
  fromDeepSearch: boolean
  // URL rules of self + every ancestor group; an entry is visible for a URL
  // only when every link allows it (mirrors per-level filterCommandsByUrl).
  urlRuleChain: UrlRuleChainLink[]
}

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

const toLowerName = (name: string | string[] | undefined): string => {
  if (Array.isArray(name)) {
    return (name[0] ?? "").toLowerCase()
  }

  return (name ?? "").toLowerCase()
}

const resolveEntryKeybinding = (
  command: CommandNode,
  commandSettings: Record<string, CommandSettings>,
): string => {
  if (!allowsKeybinding(command)) {
    return ""
  }

  const raw =
    commandSettings[command.id]?.keybinding ||
    (command.type === "action" || command.type === "submit"
      ? command.keybinding
      : undefined) ||
    ""

  return (normalizeKeybinding(raw) || "").toLowerCase()
}

type EntryParams = {
  command: CommandNode
  breadcrumb: string[]
  sourceWeight: number
  fromDeepSearch: boolean
  inheritedPermissions: BrowserPermission[]
  urlRuleChain: UrlRuleChainLink[]
  dedupeKey?: string
}

type BuildShared = {
  context: Browser.Context
  commandSettings: Record<string, CommandSettings>
  favoriteCommandIds: string[]
  entries: IndexEntry[]
}

const createEntry = async (
  params: EntryParams,
  shared: BuildShared,
): Promise<IndexEntry> => {
  const { command } = params
  const name = await resolveAsyncProperty(command.name, shared.context)
  const keywords =
    (await resolveAsyncProperty(command.keywords, shared.context)) || []
  const description = await resolveAsyncProperty(
    command.description,
    shared.context,
  )

  const breadcrumbFromName = Array.isArray(name) ? name.slice(1) : []

  const matchFields = {
    nameLower: toLowerName(name),
    breadcrumbLower: [...breadcrumbFromName, ...params.breadcrumb].map((part) =>
      part.toLowerCase(),
    ),
    keywordsLower: keywords.map((keyword) => keyword.toLowerCase()),
    descriptionLower: (description ?? "").toLowerCase(),
    keybindingLower: resolveEntryKeybinding(command, shared.commandSettings),
  }

  return {
    id: command.id,
    command,
    ...matchFields,
    // Tokenize once at build time so the per-keystroke scorer never splits or
    // allocates field arrays.
    ...computeScorableTokens(matchFields),
    sourceWeight: params.sourceWeight,
    dedupeKey: params.dedupeKey,
    isFavorite: shared.favoriteCommandIds.includes(command.id),
    inheritedPermissions: params.inheritedPermissions,
    fromDeepSearch: params.fromDeepSearch,
    urlRuleChain: params.urlRuleChain,
  }
}

// Walks group children once per group; the resolved children feed both
// favorites collection and deep-search flattening.
const walkGroups = async (
  commands: CommandNode[],
  parentPath: string[],
  inheritedDeepSearch: boolean,
  inheritedPermissions: BrowserPermission[],
  parentChain: UrlRuleChainLink[],
  rootWeight: number | undefined,
  shared: BuildShared,
): Promise<void> => {
  const hasFavorites = shared.favoriteCommandIds.length > 0

  for (const command of commands) {
    if (command.type !== "group") {
      continue
    }

    const enableFlag = command.enableDeepSearch
    const shouldDeepSearch =
      enableFlag === true || (inheritedDeepSearch && enableFlag !== false)

    // Skip descending when this subtree can contribute nothing
    if (!shouldDeepSearch && !hasFavorites) {
      continue
    }

    const permissions = mergePermissions(
      inheritedPermissions,
      command.permissions,
    )

    // Resolve weight once from the root deep-search group id
    const effectiveWeight =
      rootWeight ??
      DEEP_SEARCH_RANK_WEIGHTS[command.id] ??
      DEFAULT_DEEP_SEARCH_WEIGHT

    try {
      if (permissions.length > 0) {
        const { hasAllPermissions } = await checkPermissions(permissions)
        if (!hasAllPermissions) {
          continue
        }
      }

      // The single children() resolve for this group
      const children = await command.children(shared.context)

      const parentName = await resolveCommandName(command.name, shared.context)
      const newPath = [...parentPath, parentName]
      const chain: UrlRuleChainLink[] = [
        ...parentChain,
        { id: command.id, urlRules: command.urlRules },
      ]

      for (const child of children) {
        const childChain: UrlRuleChainLink[] = [
          ...chain,
          { id: child.id, urlRules: child.urlRules },
        ]
        const reversedPath = [...newPath].reverse()

        if (
          shouldDeepSearch &&
          (child.type === "action" || child.type === "submit")
        ) {
          const childName = await resolveAsyncProperty(
            child.name,
            shared.context,
          )
          const childKeywords =
            (await resolveAsyncProperty(child.keywords, shared.context)) || []
          const childDescription = await resolveAsyncProperty(
            child.description,
            shared.context,
          )
          const childKeybinding =
            shared.commandSettings[child.id]?.keybinding || child.keybinding

          const enhancedChild: ActionCommandNode | SubmitCommandNode = {
            ...child,
            name: [toDisplayName(childName), ...reversedPath],
            keywords: [
              ...childKeywords,
              ...newPath.map((part) => part.toLowerCase()),
              ...(childDescription && typeof childDescription === "string"
                ? [childDescription.toLowerCase()]
                : []),
            ],
            keybinding: childKeybinding,
          }

          shared.entries.push(
            await createEntry(
              {
                command: enhancedChild,
                breadcrumb: [],
                sourceWeight: effectiveWeight,
                fromDeepSearch: true,
                inheritedPermissions: permissions,
                urlRuleChain: childChain,
                dedupeKey: child.dedupeKey,
              },
              shared,
            ),
          )
        } else if (shared.favoriteCommandIds.includes(child.id)) {
          // Nested favorite that isn't deep-search flattened still needs a
          // searchable entry with its breadcrumb (mirrors the previous
          // findFavoritedCommands naming).
          const childName = await resolveCommandName(child.name, shared.context)

          shared.entries.push(
            await createEntry(
              {
                command: {
                  ...child,
                  name: [childName, ...reversedPath],
                  permissions: mergePermissions(permissions, child.permissions),
                } as CommandNode,
                breadcrumb: [],
                sourceWeight: 1,
                fromDeepSearch: false,
                inheritedPermissions: permissions,
                urlRuleChain: childChain,
              },
              shared,
            ),
          )
        }
      }

      const childGroups = children.filter(
        (child): child is GroupCommandNode => child.type === "group",
      )

      if (childGroups.length > 0) {
        await walkGroups(
          childGroups,
          newPath,
          shouldDeepSearch,
          permissions,
          chain,
          shouldDeepSearch ? effectiveWeight : undefined,
          shared,
        )
      }
    } catch (error) {
      console.error(
        `[SearchIndex] Error resolving children for command ${command.id}:`,
        error,
      )
    }
  }
}

const toDisplayName = (name: string | string[] | undefined): string => {
  if (Array.isArray(name)) {
    return name[0] ?? "Unnamed Command"
  }

  return name ?? "Unnamed Command"
}

// Dedupe entries (moved from getDeepSearchCommands.ts, semantics preserved).
// Pass A: collapse identical ids, keeping the highest-weight entry and
//         merging the favorite flag (fixes history items appearing in
//         multiple time-period groups with the same id).
// Pass B: collapse by dedupeKey across sources, keeping only entries with the
//         highest weight for that key. Entries without a dedupeKey pass
//         through untouched; same-weight duplicates are both kept.
const dedupeEntries = (entries: IndexEntry[]): IndexEntry[] => {
  // Pass A — by id
  const byId = new Map<string, IndexEntry>()
  for (const entry of entries) {
    const existing = byId.get(entry.id)
    if (!existing) {
      byId.set(entry.id, entry)
      continue
    }

    const winner = entry.sourceWeight > existing.sourceWeight ? entry : existing
    byId.set(entry.id, {
      ...winner,
      isFavorite: existing.isFavorite || entry.isFavorite,
    })
  }
  const idDeduped = [...byId.values()]

  // Pass B — by dedupeKey, order-preserving
  const maxWeightByKey = new Map<string, number>()
  for (const entry of idDeduped) {
    if (entry.dedupeKey != null) {
      const previous = maxWeightByKey.get(entry.dedupeKey) ?? -Infinity
      if (entry.sourceWeight > previous) {
        maxWeightByKey.set(entry.dedupeKey, entry.sourceWeight)
      }
    }
  }

  return idDeduped.filter(
    (entry) =>
      entry.dedupeKey == null ||
      entry.sourceWeight === maxWeightByKey.get(entry.dedupeKey),
  )
}

const buildSearchIndex = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<{
  entries: IndexEntry[]
  commandSettings: Record<string, CommandSettings>
}> => {
  // Hoisted single reads — previously re-read per converted suggestion
  const commandSettings = await getAllCommandSettings()
  const favoriteCommandIds = await getFavoriteCommandIds()

  // Build with a URL-free context so the cache survives page navigation; URL
  // visibility is applied at query time from each entry's rule chain.
  const buildContext: Browser.Context = options?.siteSdk
    ? {
        url: context?.url ?? "",
        title: context?.title ?? "",
        modifierKey: null,
        isNewTab: context?.isNewTab,
      }
    : {
        url: "",
        title: "",
        modifierKey: null,
        isNewTab: context?.isNewTab,
      }

  const shared: BuildShared = {
    context: buildContext,
    commandSettings,
    favoriteCommandIds,
    entries: [],
  }

  const rootCommands = loadAllCommands(buildContext, options)

  for (const command of rootCommands) {
    shared.entries.push(
      await createEntry(
        {
          command,
          breadcrumb: [],
          sourceWeight: 1,
          fromDeepSearch: false,
          inheritedPermissions: [],
          urlRuleChain: [{ id: command.id, urlRules: command.urlRules }],
        },
        shared,
      ),
    )
  }

  const hasDeepSearchRoots = rootCommands.some(
    (command) => command.type === "group" && command.enableDeepSearch === true,
  )

  // Skip the tree walk entirely when nothing below the root can contribute
  if (hasDeepSearchRoots || favoriteCommandIds.length > 0) {
    await walkGroups(rootCommands, [], false, [], [], undefined, shared)
  }

  return { entries: dedupeEntries(shared.entries), commandSettings }
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

  if (inflightBuild && inflightBuild.contextKey === contextKey) {
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
    return index
  })()

  inflightBuild = { contextKey, promise }

  try {
    return await promise
  } finally {
    if (inflightBuild?.promise === promise) {
      inflightBuild = null
    }
  }
}

export const invalidateSearchIndex = (): void => {
  cachedIndex = null
  inflightBuild = null
  visibleCache = null
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
  if (!currentUrl || currentUrl === "") {
    return entries
  }

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
  const favoriteCommandIds = await getFavoriteCommandIds()

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
          urlRuleChain: [{ id: command.id, urlRules: command.urlRules }],
        },
        shared,
      ),
    ),
  )
}

// Wire browser events that change command sources or visibility. Settings and
// favorites mutations are covered via storage.onChanged (both write
// chrome.storage.local), which avoids import cycles with settings.ts and
// favorites.ts. Every listener is existence-guarded for Firefox.
export const initializeSearchIndexInvalidation = (): void => {
  const api = getBrowserAPI()
  const invalidate = () => invalidateSearchIndex()

  api.tabs?.onCreated?.addListener(invalidate)
  api.tabs?.onRemoved?.addListener(invalidate)
  api.tabs?.onUpdated?.addListener(invalidate)
  api.tabs?.onActivated?.addListener(invalidate)
  api.history?.onVisited?.addListener(invalidate)
  api.history?.onVisitRemoved?.addListener(invalidate)
  api.bookmarks?.onCreated?.addListener(invalidate)
  api.bookmarks?.onRemoved?.addListener(invalidate)
  api.bookmarks?.onChanged?.addListener(invalidate)
  api.bookmarks?.onMoved?.addListener(invalidate)
  api.sessions?.onChanged?.addListener(invalidate)
  api.permissions?.onAdded?.addListener(invalidate)
  api.permissions?.onRemoved?.addListener(invalidate)
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
