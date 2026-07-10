// Architecture: background command system. Pure search-index construction:
// resolves the URL-free command tree once, flattens deep-search descendants
// and nested favorites, then deduplicates entries. Cache lifetime,
// invalidation, and query-time URL visibility remain in searchIndex.ts.
//
// Building the index is a single resolve pass for the per-keystroke search
// path: settings and favorites are read once, and each group's children() is
// called exactly once, shared by nested-favorite entries and deep-search
// flattening. The root empty state (monocle-commands-get) does NOT use the
// index: query.ts still walks the tree per request (findFavoritedCommands)
// with the real page context, so context-dependent children stay correct
// there. See docs/search-and-ranking.md.
import type {
  ActionCommandNode,
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  GroupCommandNode,
  SubmitCommandNode,
} from "../../shared/types"
import { resolveEffectiveKeybinding } from "../keybindings/targets"
import { resolveAsyncProperty, resolveCommandName } from "../utils/commands"
import { getFavoriteCommandIds } from "./favorites"
import { mergePermissions } from "./query"
import { computeScorableTokens } from "./searchScore"
import { getAllCommandSettings } from "./settings"
import { type CommandLoadOptions, loadAllCommands } from "./source"
import {
  appendUrlRuleChain,
  hasAllPermissions,
  reverseBreadcrumb,
  shouldDeepSearchGroup,
  toUrlRuleChainLink,
  type UrlRuleChainLink,
} from "./traversal"

// Source-based ranking multipliers for deep-search entries. Root commands are
// implicitly 1.0.
//
// Order matters for same-URL dedupe (see dedupeEntries Pass B): when a URL
// appears in more than one source, the highest-weight source wins the row and
// its name is what shows and ranks. Bookmarks sit above open tabs so a
// bookmarked page surfaces under its user-given name (e.g. "My Pull Requests")
// rather than a transient tab title; opening it still focuses an existing tab.
export const DEEP_SEARCH_RANK_WEIGHTS: Record<string, number> = {
  bookmarks: 0.97,
  "open-tabs": 0.95,
  "recently-closed": 0.8,
  history: 0.7,
}
const DEFAULT_DEEP_SEARCH_WEIGHT = 1

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
  return resolveEffectiveKeybinding(
    command,
    commandSettings[command.id],
  ).toLowerCase()
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

export type BuildShared = {
  context: Browser.Context
  commandSettings: Record<string, CommandSettings>
  favoriteCommandIds: ReadonlySet<string>
  entries: IndexEntry[]
}

export const createEntry = async (
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
    isFavorite: shared.favoriteCommandIds.has(command.id),
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
  const hasFavorites = shared.favoriteCommandIds.size > 0

  for (const command of commands) {
    if (command.type !== "group") {
      continue
    }

    const shouldDeepSearch = shouldDeepSearchGroup(command, inheritedDeepSearch)

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
      if (!(await hasAllPermissions(permissions))) {
        continue
      }

      // The single children() resolve for this group
      const children = await command.children(shared.context)

      const parentName = await resolveCommandName(command.name, shared.context)
      const newPath = [...parentPath, parentName]
      const chain = appendUrlRuleChain(parentChain, command)

      for (const child of children) {
        const childChain = appendUrlRuleChain(chain, child)
        const reversedPath = reverseBreadcrumb(newPath)

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
        } else if (shared.favoriteCommandIds.has(child.id)) {
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

  // Pass B — by dedupeKey, order-preserving. Entries without a dedupeKey pass
  // through untouched; same-weight duplicates are both kept. Survivors absorb
  // the searchable name/keywords of the same-URL entries they displace, so a
  // destination stays findable by every source's name (e.g. a bookmark's
  // user-given name and an open tab's title both reach the surviving row) even
  // though only one row is shown.
  const maxWeightByKey = new Map<string, number>()
  for (const entry of idDeduped) {
    if (entry.dedupeKey != null) {
      const previous = maxWeightByKey.get(entry.dedupeKey) ?? -Infinity
      if (entry.sourceWeight > previous) {
        maxWeightByKey.set(entry.dedupeKey, entry.sourceWeight)
      }
    }
  }

  // Collect the search terms contributed by the entries that lose their key, so
  // the survivor for that key can fold them into its keywords.
  const droppedTermsByKey = new Map<string, string[]>()
  for (const entry of idDeduped) {
    if (
      entry.dedupeKey == null ||
      entry.sourceWeight === maxWeightByKey.get(entry.dedupeKey)
    ) {
      continue
    }

    const terms = droppedTermsByKey.get(entry.dedupeKey) ?? []
    if (entry.nameLower) {
      terms.push(entry.nameLower)
    }
    terms.push(...entry.keywordsLower)
    droppedTermsByKey.set(entry.dedupeKey, terms)
  }

  return idDeduped
    .filter(
      (entry) =>
        entry.dedupeKey == null ||
        entry.sourceWeight === maxWeightByKey.get(entry.dedupeKey),
    )
    .map((entry) => {
      const dropped =
        entry.dedupeKey != null
          ? droppedTermsByKey.get(entry.dedupeKey)
          : undefined
      if (!dropped || dropped.length === 0) {
        return entry
      }

      const keywordsLower = [...entry.keywordsLower]
      for (const term of dropped) {
        if (term !== entry.nameLower && !keywordsLower.includes(term)) {
          keywordsLower.push(term)
        }
      }

      // Re-tokenize so the per-keystroke scorer sees the merged keywords.
      return {
        ...entry,
        keywordsLower,
        ...computeScorableTokens({ ...entry, keywordsLower }),
      }
    })
}

/**
 * The single resolve pass that produces a context's index: one root entry per
 * top-level command, then walkGroups flattens deep-search descendants and
 * nested favorites, and dedupeEntries collapses id/URL duplicates. Settings and
 * favorites are read once here (not per converted suggestion). Built against a
 * URL-free context so the cache survives navigation — URL visibility is applied
 * at query time from each entry's rule chain. The tree walk is skipped entirely
 * when no deep-search roots and no favorites exist. See
 * docs/search-and-ranking.md.
 */
export const buildSearchIndex = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<{
  entries: IndexEntry[]
  commandSettings: Record<string, CommandSettings>
}> => {
  // Hoisted single reads — previously re-read per converted suggestion
  const commandSettings = await getAllCommandSettings()
  const favoriteCommandIds = new Set(await getFavoriteCommandIds())

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
          urlRuleChain: [toUrlRuleChainLink(command)],
        },
        shared,
      ),
    )
  }

  const hasDeepSearchRoots = rootCommands.some(
    (command) => command.type === "group" && command.enableDeepSearch === true,
  )

  // Skip the tree walk entirely when nothing below the root can contribute
  if (hasDeepSearchRoots || favoriteCommandIds.size > 0) {
    await walkGroups(rootCommands, [], false, [], [], undefined, shared)
  }

  return { entries: dedupeEntries(shared.entries), commandSettings }
}
