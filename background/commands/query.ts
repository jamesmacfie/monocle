import type {
  Browser,
  BrowserPermission,
  CommandExecutionScope,
  CommandNode,
  CommandSettings,
  GroupCommandNode,
  SearchCommandNode,
} from "../../shared/types"
import { resolveAsyncProperty, resolveCommandName } from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { filterCommandsByUrl } from "../utils/urlFilter"
import { getFavoriteCommandIds } from "./favorites"
import { getAllCommandSettings } from "./settings"
import { isSiteSdkCommandId } from "./siteSdk"
import { type CommandLoadOptions, loadAllCommands } from "./source"
import { getRankedCommandIds } from "./usage"

export type ResolvedCommand = {
  command: CommandNode
  permissions: BrowserPermission[]
  parentNames?: string[]
}

export type CommandCollections = {
  favorites: CommandNode[]
  suggestions: CommandNode[]
}

type CommandPage = {
  pageCommand?: CommandNode
  commands: CommandNode[]
  inheritedPermissions: BrowserPermission[]
  parentNames: string[]
}

export const normalizeContext = (
  context?: Browser.Context,
): Browser.Context => ({
  url: context?.url ?? "",
  title: context?.title ?? "",
  modifierKey: context?.modifierKey ?? null,
  isNewTab: context?.isNewTab,
})

export const mergePermissions = (
  inherited: BrowserPermission[],
  own?: BrowserPermission[],
): BrowserPermission[] => {
  return Array.from(new Set([...inherited, ...(own ?? [])]))
}

const checkRequiredPermissions = async (
  permissions: BrowserPermission[],
): Promise<{
  hasAllPermissions: boolean
  missingPermissions: BrowserPermission[]
}> => {
  if (permissions.length === 0) {
    return {
      hasAllPermissions: true,
      missingPermissions: [],
    }
  }

  return await checkPermissions(permissions)
}

const hasRequiredPermissions = async (
  permissions: BrowserPermission[],
): Promise<boolean> => {
  return (await checkRequiredPermissions(permissions)).hasAllPermissions
}

const createMissingPermissionsCommand = (
  permissions: BrowserPermission[],
): CommandNode => {
  const permissionList = permissions.join(", ")

  return {
    type: "display",
    id: `missing-permissions-${permissions.join("-")}`,
    name: "Permission Required",
    description: `Grant ${permissionList} permission${permissions.length === 1 ? "" : "s"} to view these commands.`,
    icon: { type: "lucide", name: "ShieldAlert" },
    color: "red",
    permissions,
  }
}

const filterForContext = async (
  commands: CommandNode[],
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
): Promise<CommandNode[]> => {
  return await filterCommandsByUrl(commands, context.url || "", commandSettings)
}

export const getFilteredRootCommands = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<CommandNode[]> => {
  const normalizedContext = normalizeContext(context)
  const commandSettings = await getAllCommandSettings()

  return await filterForContext(
    loadAllCommands(normalizedContext, options),
    normalizedContext,
    commandSettings,
  )
}

const findFavoritedCommands = async (
  commands: CommandNode[],
  favoriteCommandIds: string[],
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
  parentNames: string[] = [],
  inheritedPermissions: BrowserPermission[] = [],
): Promise<CommandNode[]> => {
  const favoritedCommands: CommandNode[] = []

  for (const command of commands) {
    const permissions = mergePermissions(
      inheritedPermissions,
      command.permissions,
    )

    if (favoriteCommandIds.includes(command.id)) {
      if (parentNames.length > 0) {
        const resolvedName = await resolveAsyncProperty(command.name, context)
        favoritedCommands.push({
          ...command,
          permissions,
          name: Array.isArray(resolvedName)
            ? [...resolvedName, ...parentNames]
            : [resolvedName ?? "Unnamed Command", ...parentNames],
        })
      } else {
        favoritedCommands.push({ ...command, permissions })
      }
    }

    if (command.type !== "group") {
      continue
    }

    try {
      if (!(await hasRequiredPermissions(permissions))) {
        continue
      }

      const children = await command.children(context)
      const filteredChildren = await filterForContext(
        children,
        context,
        commandSettings,
      )
      const parentName = await resolveCommandName(command.name, context)

      favoritedCommands.push(
        ...(await findFavoritedCommands(
          filteredChildren,
          favoriteCommandIds,
          context,
          commandSettings,
          [parentName, ...parentNames],
          permissions,
        )),
      )
    } catch (error) {
      console.error(`Error getting children for command ${command.id}:`, error)
    }
  }

  return favoritedCommands
}

const sortSuggestionsByUsage = async (
  commands: CommandNode[],
  excludedCommandIds: Set<string>,
): Promise<CommandNode[]> => {
  const rankedCommandIds = await getRankedCommandIds()
  const rankingMap = new Map<string, number>()

  rankedCommandIds.forEach((id, index) => {
    rankingMap.set(id, index)
  })

  const visibleCommands = commands.filter(
    (command) => !excludedCommandIds.has(command.id),
  )
  const siteSdkCommands = visibleCommands.filter((command) =>
    isSiteSdkCommandId(command.id),
  )
  const nativeCommands = visibleCommands.filter(
    (command) => !isSiteSdkCommandId(command.id),
  )

  return [
    ...siteSdkCommands,
    ...nativeCommands.sort((a, b) => {
      const rankA = rankingMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const rankB = rankingMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return rankA - rankB
    }),
  ]
}

export const getCommandCollections = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<CommandCollections> => {
  const normalizedContext = normalizeContext(context)
  const commandSettings = await getAllCommandSettings()
  const filteredCommands = await filterForContext(
    loadAllCommands(normalizedContext, options),
    normalizedContext,
    commandSettings,
  )
  const favoriteCommandIds = await getFavoriteCommandIds()

  const favorites = await findFavoritedCommands(
    filteredCommands,
    favoriteCommandIds,
    normalizedContext,
    commandSettings,
  )
  const addedCommandIds = new Set(favorites.map((command) => command.id))
  const suggestions = await sortSuggestionsByUsage(
    filteredCommands,
    addedCommandIds,
  )

  return {
    favorites,
    suggestions,
  }
}

const getFilteredChildren = async (
  command: GroupCommandNode,
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
): Promise<CommandNode[]> => {
  const children = await command.children(context)
  return await filterForContext(children, context, commandSettings)
}

export const getCommandPageCommands = async (
  context: Browser.Context,
  parentPath: string[] = [],
  searchValue?: string,
  options?: CommandLoadOptions,
): Promise<CommandPage> => {
  const normalizedContext = normalizeContext(context)
  const commandSettings = await getAllCommandSettings()
  let commands = await filterForContext(
    loadAllCommands(normalizedContext, options),
    normalizedContext,
    commandSettings,
  )
  let inheritedPermissions: BrowserPermission[] = []
  const parentNames: string[] = []
  let pageCommand: CommandNode | undefined

  for (const parentId of parentPath) {
    pageCommand = commands.find((command) => command.id === parentId)

    if (!pageCommand) {
      return {
        pageCommand: undefined,
        commands: [],
        inheritedPermissions,
        parentNames,
      }
    }

    inheritedPermissions = mergePermissions(
      inheritedPermissions,
      pageCommand.permissions,
    )
    parentNames.unshift(
      await resolveCommandName(pageCommand.name, normalizedContext),
    )

    if (pageCommand.type === "group") {
      const permissionState =
        await checkRequiredPermissions(inheritedPermissions)

      if (!permissionState.hasAllPermissions) {
        return {
          pageCommand,
          commands: [
            createMissingPermissionsCommand(permissionState.missingPermissions),
          ],
          inheritedPermissions,
          parentNames,
        }
      }

      commands = await getFilteredChildren(
        pageCommand,
        normalizedContext,
        commandSettings,
      )
      continue
    }

    if (pageCommand.type === "search") {
      commands = []
      break
    }

    return {
      pageCommand,
      commands: [],
      inheritedPermissions,
      parentNames,
    }
  }

  if (pageCommand?.type === "search") {
    const permissionState = await checkRequiredPermissions(inheritedPermissions)

    if (!permissionState.hasAllPermissions) {
      commands = [
        createMissingPermissionsCommand(permissionState.missingPermissions),
      ]
    } else {
      const search = (searchValue || "").trim()
      const searchNode = pageCommand as SearchCommandNode

      if (!search) {
        commands = []
      } else {
        try {
          commands = await filterForContext(
            await searchNode.getResults(normalizedContext, search),
            normalizedContext,
            commandSettings,
          )
        } catch (error) {
          console.error(
            `[SearchNode] Error resolving results for ${searchNode.id}:`,
            error,
          )
          commands = []
        }
      }
    }
  }

  return {
    pageCommand,
    commands,
    inheritedPermissions,
    parentNames,
  }
}

const findCommandRecursive = async (
  commands: CommandNode[],
  commandId: string,
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
  inheritedPermissions: BrowserPermission[] = [],
  parentNames: string[] = [],
): Promise<ResolvedCommand | undefined> => {
  const filteredCommands = await filterForContext(
    commands,
    context,
    commandSettings,
  )

  for (const command of filteredCommands) {
    const permissions = mergePermissions(
      inheritedPermissions,
      command.permissions,
    )

    if (command.id === commandId) {
      return {
        command,
        permissions,
        parentNames: parentNames.length > 0 ? parentNames : undefined,
      }
    }

    if (command.type !== "group") {
      continue
    }

    if (!(await hasRequiredPermissions(permissions))) {
      continue
    }

    try {
      const children = await command.children(context)
      const parentName = await resolveCommandName(command.name, context)
      const found = await findCommandRecursive(
        children,
        commandId,
        context,
        commandSettings,
        permissions,
        [parentName, ...parentNames],
      )

      if (found) {
        return found
      }
    } catch (error) {
      console.error(`Error getting children for command ${command.id}:`, error)
    }
  }

  return undefined
}

export const resolveCommandById = async (
  commandId: string,
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<ResolvedCommand | undefined> => {
  const normalizedContext = normalizeContext(context)
  const commandSettings = await getAllCommandSettings()

  return await findCommandRecursive(
    loadAllCommands(normalizedContext, options),
    commandId,
    normalizedContext,
    commandSettings,
  )
}

export const resolveCommandInPage = async (
  commandId: string,
  context: Browser.Context,
  scope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<ResolvedCommand | undefined> => {
  const normalizedContext = normalizeContext(context)

  if (!scope || scope.pageId === "root") {
    return await resolveCommandById(commandId, normalizedContext, options)
  }

  const parentPath =
    scope.parentPath && scope.parentPath.length > 0
      ? scope.parentPath
      : [scope.pageId]
  const page = await getCommandPageCommands(
    normalizedContext,
    parentPath,
    scope.searchValue,
    options,
  )
  const command = page.commands.find((item) => item.id === commandId)

  if (command) {
    return {
      command,
      permissions: mergePermissions(
        page.inheritedPermissions,
        command.permissions,
      ),
      parentNames: page.parentNames.length > 0 ? page.parentNames : undefined,
    }
  }

  if (page.pageCommand?.id === commandId) {
    return {
      command: page.pageCommand,
      permissions: page.inheritedPermissions,
      parentNames: page.parentNames.slice(1),
    }
  }

  return undefined
}
