// Architecture: background keybindings. Resolves the flat list of
// (id, name, keybinding, behavior) entries that the registry and conflict
// checks match against — collecting both default keybindings discovered by
// walking deep-search command groups and any custom keybindings set via command
// settings, deduped by id+binding. Three layers keep this off the hot path:
// (1) a module-scoped per-context entries cache keyed by isNewTab|url|platform,
// URL-filtered at build time so each navigation rebuilds once; (2) an inflight
// build map so concurrent loads share one build; and (3) a TTL backstop plus a
// cacheGeneration guard so a build that started before an invalidation can't
// re-insert a stale result. See docs/keybindings.md.
import type {
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  KeybindingBehavior,
} from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { getPlatform } from "../commands/platform"
import {
  getFilteredRootCommands,
  mergePermissions,
  normalizeContext,
  resolveCommandById,
} from "../commands/query"
import { getAllCommandSettings } from "../commands/settings"
import type { CommandLoadOptions } from "../commands/source"
import { resolveCommandName } from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { filterCommandsByUrl } from "../utils/urlFilter"
import { getKeybindingTargetMetadata } from "./targets"

export type KeybindingCommandEntry = {
  id: string
  name: string
  keybinding: string
  behavior: KeybindingBehavior
}

const hasRequiredPermissions = async (
  permissions: BrowserPermission[],
): Promise<boolean> => {
  if (permissions.length === 0) return true
  return (await checkPermissions(permissions)).hasAllPermissions
}

const addKeybindingEntry = async (
  entries: KeybindingCommandEntry[],
  seenEntries: Set<string>,
  command: CommandNode,
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
): Promise<void> => {
  const keybindingTarget = getKeybindingTargetMetadata(
    command,
    commandSettings[command.id],
  )
  const keybinding = keybindingTarget.effectiveKeybinding
  if (!keybinding) return

  const entryKey = `${command.id}:${keybinding}`
  if (seenEntries.has(entryKey)) return

  seenEntries.add(entryKey)
  entries.push({
    id: command.id,
    name: await resolveCommandName(command.name, context),
    keybinding,
    behavior: keybindingTarget.behavior,
  })
}

const collectDeepSearchEntries = async (
  commands: CommandNode[],
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
  entries: KeybindingCommandEntry[],
  seenEntries: Set<string>,
  inheritedDeepSearch = false,
  inheritedPermissions: BrowserPermission[] = [],
): Promise<void> => {
  for (const command of commands) {
    await addKeybindingEntry(
      entries,
      seenEntries,
      command,
      context,
      commandSettings,
    )

    if (command.type !== "group") {
      continue
    }

    const enableFlag = command.enableDeepSearch
    const shouldDeepSearch =
      enableFlag === true || (inheritedDeepSearch && enableFlag !== false)

    if (!shouldDeepSearch) {
      continue
    }

    const permissions = mergePermissions(
      inheritedPermissions,
      command.permissions,
    )

    if (!(await hasRequiredPermissions(permissions))) {
      continue
    }

    try {
      const children = await command.children(context)
      const filteredChildren = await filterCommandsByUrl(
        children,
        context.url || "",
        commandSettings,
      )

      await collectDeepSearchEntries(
        filteredChildren,
        context,
        commandSettings,
        entries,
        seenEntries,
        true,
        permissions,
      )
    } catch (error) {
      console.error(
        `[KeybindingSource] Failed to load deep-search children for ${command.id}:`,
        error,
      )
    }
  }
}

const collectCustomSettingEntries = async (
  context: Browser.Context,
  options: CommandLoadOptions | undefined,
  commandSettings: Record<string, CommandSettings>,
  entries: KeybindingCommandEntry[],
  seenEntries: Set<string>,
): Promise<void> => {
  for (const [commandId, settings] of Object.entries(commandSettings)) {
    if (!settings.keybinding) {
      continue
    }

    const resolved = await resolveCommandById(commandId, context, options)
    if (!resolved) {
      continue
    }

    await addKeybindingEntry(
      entries,
      seenEntries,
      resolved.command,
      context,
      commandSettings,
    )
  }
}

const buildKeybindingCommandEntries = async (
  normalizedContext: Browser.Context,
  options?: CommandLoadOptions,
): Promise<KeybindingCommandEntry[]> => {
  const commandSettings = await getAllCommandSettings()
  const rootCommands = await getFilteredRootCommands(normalizedContext, options)
  const entries: KeybindingCommandEntry[] = []
  const seenEntries = new Set<string>()

  await collectDeepSearchEntries(
    rootCommands,
    normalizedContext,
    commandSettings,
    entries,
    seenEntries,
  )

  await collectCustomSettingEntries(
    normalizedContext,
    options,
    commandSettings,
    entries,
    seenEntries,
  )

  return entries
}

// Module-scoped entries cache (same service-worker lifetime pattern as
// commands/searchIndex.ts). Unlike the search index, keybinding entries are
// URL-filtered at build time, so the cache key includes the URL: one rebuild
// per navigation, while the hot path — every keystroke on one page funnelling
// through execute-keybinding/get-keybinding-state — is a Map lookup instead of
// a full command-tree traversal. Invalidation: ~30s TTL backstop plus the
// events wired in initializeKeybindingEntriesInvalidation(), plus explicit
// invalidation from settings write paths via refreshKeybindingRegistry().
const ENTRIES_TTL_MS = 30_000
const MAX_CACHED_CONTEXTS = 8

type CachedEntries = {
  entries: KeybindingCommandEntry[]
  builtAt: number
}

const entriesCache = new Map<string, CachedEntries>()
const inflightBuilds = new Map<string, Promise<KeybindingCommandEntry[]>>()
// Bumped on invalidation so a build that started before the invalidation
// cannot re-insert its (potentially stale) result.
let cacheGeneration = 0

const getEntriesCacheKey = (
  context: Browser.Context,
  options?: CommandLoadOptions,
): string => {
  const siteSdkKey = options?.siteSdk
    ? `|site:${options.siteSdk.scopeKey}:${options.siteSdk.revision}`
    : ""
  return `${context.isNewTab ? "newtab" : "page"}|${context.url || ""}|${getPlatform(options)}${siteSdkKey}`
}

const storeCachedEntries = (
  cacheKey: string,
  entries: KeybindingCommandEntry[],
): void => {
  const now = Date.now()

  for (const [key, cached] of entriesCache) {
    if (now - cached.builtAt >= ENTRIES_TTL_MS) {
      entriesCache.delete(key)
    }
  }

  while (entriesCache.size >= MAX_CACHED_CONTEXTS) {
    let oldestKey: string | undefined
    let oldestBuiltAt = Infinity
    for (const [key, cached] of entriesCache) {
      if (cached.builtAt < oldestBuiltAt) {
        oldestBuiltAt = cached.builtAt
        oldestKey = key
      }
    }
    if (oldestKey === undefined) break
    entriesCache.delete(oldestKey)
  }

  entriesCache.set(cacheKey, { entries, builtAt: now })
}

export const invalidateKeybindingEntriesCache = (): void => {
  cacheGeneration += 1
  entriesCache.clear()
  inflightBuilds.clear()
}

// Wire browser events that change which commands can carry keybindings.
// Settings mutations are covered via storage.onChanged, which avoids import
// cycles with settings.ts. Deliberately NOT wired to tab/history/bookmark
// events (unlike the search index): those fire constantly and dynamic
// children almost never carry default keybindings — the TTL covers the rare
// drift. Every listener is existence-guarded for Firefox.
export const initializeKeybindingEntriesInvalidation = (): void => {
  const api = getBrowserAPI()
  const invalidate = () => invalidateKeybindingEntriesCache()

  api.permissions?.onAdded?.addListener(invalidate)
  api.permissions?.onRemoved?.addListener(invalidate)
  api.storage?.onChanged?.addListener(
    (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === "local" && "monocle-settings" in changes) {
        invalidate()
      }
    },
  )
}

export const loadKeybindingCommandEntries = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<KeybindingCommandEntry[]> => {
  const normalizedContext = normalizeContext(context)
  const cacheKey = getEntriesCacheKey(normalizedContext, options)

  const cached = entriesCache.get(cacheKey)
  if (cached) {
    if (Date.now() - cached.builtAt < ENTRIES_TTL_MS) {
      return cached.entries
    }
    entriesCache.delete(cacheKey)
  }

  const inflight = inflightBuilds.get(cacheKey)
  if (inflight) {
    return await inflight
  }

  const generation = cacheGeneration
  const build = (async (): Promise<KeybindingCommandEntry[]> => {
    const entries = await buildKeybindingCommandEntries(
      normalizedContext,
      options,
    )
    if (generation === cacheGeneration) {
      storeCachedEntries(cacheKey, entries)
    }
    return entries
  })()

  inflightBuilds.set(cacheKey, build)
  try {
    return await build
  } finally {
    if (inflightBuilds.get(cacheKey) === build) {
      inflightBuilds.delete(cacheKey)
    }
  }
}
