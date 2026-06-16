// Architecture: background command system, options-page projection. Flattens
// the command tree into durable, executable-function-free catalog rows for the
// options UI (the options page receives data, not CommandNodes — see CLAUDE.md).
// Built against synthetic page + new-tab contexts (no real URL) so the catalog
// is context-independent and complete, deduped by id, and resolves each row's
// effective vs default keybinding, capabilities, usage stats and favorite flag.
// Only commands that opt into a configurable settingsCatalog appear; groups are
// only descended when they set settingsCatalog.includeChildren.
import type {
  Browser,
  CommandNode,
  CommandSettings,
  SettingsCatalogCommand,
  SettingsCatalogResponse,
} from "../../shared/types"
import { getKeybindingTargetMetadata } from "../keybindings/targets"
import {
  isSettingsCatalogConfigurable,
  resolveAsyncProperty,
  resolveCommandName,
} from "../utils/commands"
import { getFavoriteCommandIds } from "./favorites"
import { getPlatform } from "./platform"
import { getAllCommandSettings } from "./settings"
import {
  type CommandLoadOptions,
  type CommandSourceCategory,
  loadCommandEntries,
} from "./source"
import { getAllUsageStats } from "./usage"

type CatalogBuildOptions = {
  platform?: Browser.Platform
}

type CatalogTraversalContext = {
  context: Browser.Context
  category: CommandSourceCategory
  commandSettings: Record<string, CommandSettings>
  favoriteCommandIds: Set<string>
  usageStats: Awaited<ReturnType<typeof getAllUsageStats>>
  rows: SettingsCatalogCommand[]
  seenIds: Set<string>
}

const pageContext: Browser.Context = {
  url: "",
  title: "",
  modifierKey: null,
}

const newTabContext: Browser.Context = {
  url: "",
  title: "",
  modifierKey: null,
  isNewTab: true,
}

const toCatalogUsage = (
  usageStats: CatalogTraversalContext["usageStats"],
  commandId: string,
): SettingsCatalogCommand["usage"] => {
  const stats = usageStats[commandId]

  return {
    totalUsage: stats?.totalUsage ?? 0,
    lastUsed: stats?.lastUsed ?? 0,
    emaScore: stats?.emaScore ?? 0,
    parentNames: stats?.parentNames,
    parentIds: stats?.parentIds,
  }
}

// Resolves one command into a catalog row and appends it, skipping commands
// already seen (dedupe across the page + new-tab passes) and any that aren't
// settingsCatalog-configurable. Resolves async name/description/icon/color
// against the synthetic context and precomputes the capability flags the
// options UI gates its controls on (canHide/canFavorite/canSetKeybinding/...).
const addCatalogRow = async (
  command: CommandNode,
  parentPath: string[],
  parentNames: string[],
  traversal: CatalogTraversalContext,
): Promise<void> => {
  if (traversal.seenIds.has(command.id)) {
    return
  }

  const configurable = isSettingsCatalogConfigurable(command)
  if (!configurable) {
    return
  }

  const settings = traversal.commandSettings[command.id] || {}
  const keybindingTarget = getKeybindingTargetMetadata(command, settings)

  traversal.rows.push({
    id: command.id,
    type: command.type,
    name: await resolveCommandName(command.name, traversal.context),
    description: await resolveAsyncProperty(
      command.description,
      traversal.context,
    ),
    icon: await resolveAsyncProperty(command.icon, traversal.context),
    color: await resolveAsyncProperty(command.color, traversal.context),
    categoryId: traversal.category.id,
    categoryLabel: traversal.category.label,
    parentPath,
    parentNames,
    supportedBrowsers: command.supportedBrowsers,
    permissions: command.permissions,
    settings,
    isFavorite: traversal.favoriteCommandIds.has(command.id),
    defaultKeybinding: keybindingTarget.defaultKeybinding,
    effectiveKeybinding: keybindingTarget.effectiveKeybinding,
    keybindingRequirements: keybindingTarget.requirements,
    usage: toCatalogUsage(traversal.usageStats, command.id),
    capabilities: {
      configurable,
      canHide: configurable,
      canFavorite: configurable,
      canSetKeybinding: keybindingTarget.allowed,
      canEditUrlRules: configurable,
      hasUrlRules:
        Boolean(command.urlRules?.allowUrls?.length) ||
        Boolean(command.urlRules?.denyUrls?.length) ||
        Boolean(settings.urlRules?.allowUrls?.length) ||
        Boolean(settings.urlRules?.denyUrls?.length),
    },
  })
  traversal.seenIds.add(command.id)
}

// Adds a command's row, then recurses into its children only when it is a group
// that opts in via settingsCatalog.includeChildren. Most groups don't (their
// children are dynamic/contextual and not meaningfully configurable), so the
// catalog stays a shallow, durable list rather than a full live tree walk.
const visitCommand = async (
  command: CommandNode,
  parentPath: string[],
  parentNames: string[],
  traversal: CatalogTraversalContext,
): Promise<void> => {
  await addCatalogRow(command, parentPath, parentNames, traversal)

  if (
    command.type !== "group" ||
    command.settingsCatalog?.includeChildren !== true
  ) {
    return
  }

  try {
    const children = await command.children(traversal.context)
    const parentName = await resolveCommandName(command.name, traversal.context)

    for (const child of children) {
      await visitCommand(
        child,
        [...parentPath, command.id],
        [...parentNames, parentName],
        traversal,
      )
    }
  } catch (error) {
    console.error(
      `[SettingsCatalog] Failed to load catalog children for ${command.id}:`,
      error,
    )
  }
}

const loadCatalogCommandEntries = (
  options?: CatalogBuildOptions,
): ReturnType<typeof loadCommandEntries> => {
  const platform = getPlatform({ platform: options?.platform })
  const commandOptions: CommandLoadOptions = { platform }
  const normalEntries = loadCommandEntries(pageContext, commandOptions)
  const newTabEntries = loadCommandEntries(newTabContext, commandOptions)

  return [...normalEntries, ...newTabEntries]
}

/**
 * Builds the full settings catalog the options page renders. Walks every
 * top-level command from both the page and new-tab contexts (the new-tab
 * category uses the new-tab context so its commands resolve correctly), deduped
 * by id, then sorts rows by category label and name for stable display. This is
 * the get-command-catalog data source; getSettingsCatalogCommandById reuses it
 * for single-row lookups (e.g. keybinding requirement fallbacks).
 */
export const getSettingsCatalog = async (
  options?: CatalogBuildOptions,
): Promise<SettingsCatalogResponse> => {
  const commandSettings = await getAllCommandSettings()
  const favoriteCommandIds = new Set(await getFavoriteCommandIds())
  const usageStats = await getAllUsageStats()
  const rows: SettingsCatalogCommand[] = []
  const seenIds = new Set<string>()

  for (const { command, category } of loadCatalogCommandEntries(options)) {
    const traversal: CatalogTraversalContext = {
      context: category.id === "new-tab" ? newTabContext : pageContext,
      category,
      commandSettings,
      favoriteCommandIds,
      usageStats,
      rows,
      seenIds,
    }

    await visitCommand(command, [], [], traversal)
  }

  rows.sort((a, b) => {
    const categorySort = a.categoryLabel.localeCompare(b.categoryLabel)
    if (categorySort !== 0) {
      return categorySort
    }

    return a.name.localeCompare(b.name)
  })

  return { commands: rows }
}

export const getSettingsCatalogCommandById = async (
  commandId: string,
  options?: CatalogBuildOptions,
): Promise<SettingsCatalogCommand | undefined> => {
  const catalog = await getSettingsCatalog(options)
  return catalog.commands.find((command) => command.id === commandId)
}
