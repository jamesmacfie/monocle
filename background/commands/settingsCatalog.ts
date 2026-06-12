import type {
  Browser,
  CommandNode,
  CommandSettings,
  SettingsCatalogCommand,
  SettingsCatalogResponse,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import {
  allowsKeybinding,
  getKeybindingRequirements,
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

const getDefaultKeybinding = (command: CommandNode): string | undefined => {
  if (!allowsKeybinding(command)) {
    return undefined
  }

  return normalizeKeybinding(command.keybinding || "") || undefined
}

const getEffectiveKeybinding = (
  command: CommandNode,
  settings?: CommandSettings,
): string | undefined => {
  if (!allowsKeybinding(command)) {
    return undefined
  }

  const defaultKeybinding = getDefaultKeybinding(command)
  return normalizeKeybinding(settings?.keybinding || defaultKeybinding || "")
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
  }
}

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
  const defaultKeybinding = getDefaultKeybinding(command)
  const effectiveKeybinding = getEffectiveKeybinding(command, settings)

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
    defaultKeybinding,
    effectiveKeybinding,
    keybindingRequirements: getKeybindingRequirements(command),
    usage: toCatalogUsage(traversal.usageStats, command.id),
    capabilities: {
      configurable,
      canHide: configurable,
      canFavorite: configurable,
      canSetKeybinding: allowsKeybinding(command),
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
