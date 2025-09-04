import { match } from "ts-pattern"
import type { Browser, Command, CommandSuggestion } from "../../types/"
import { isFirefox } from "../utils/browser"
import {
  resolveActionLabel,
  resolveAsyncProperty,
  resolveModifierActionLabels,
} from "../utils/commands"
import { browserCommands, firefoxCommands } from "./browser"
import { debug } from "./debug"
import {
  clearFavoritesCommand,
  getFavoriteCommandIds,
  toggleFavoriteCommandId,
} from "./favorites"
import { clearRecentsCommand } from "./recents"
import { getAllCommandSettings } from "./settings"
import { toolCommands } from "./tools"
import {
  getAllUsageStats,
  getRankedCommandIds,
  recordCommandUsage,
} from "./usage"

// Helper function to load and filter all commands
const loadAllCommands = (): Command[] => {
  // First load in common browser commands
  const allCommandsUnfiltered = [
    ...browserCommands,
    ...toolCommands,
    clearRecentsCommand,
    clearFavoritesCommand,
    debug,
  ]

  // Then, go and grab browser specific commands
  if (isFirefox) {
    allCommandsUnfiltered.push(...firefoxCommands)
  }

  // Filter commands based on browser compatibility
  return allCommandsUnfiltered.filter((command) => {
    // If no browsers property is defined, the command works everywhere
    if (!command.supportedBrowsers) {
      return true
    }

    // Check if the command works in the current browser
    return isFirefox
      ? command.supportedBrowsers.includes("firefox")
      : command.supportedBrowsers.includes("chrome")
  })
}

// Helper function to recursively find all favorited commands including sub-commands
const findFavoritedCommands = async (
  commands: Command[],
  favoriteCommandIds: string[],
  context: Browser.Context,
  parentName?: string,
): Promise<Command[]> => {
  const favoritedCommands: Command[] = []

  for (const command of commands) {
    // Check if this command is favorited
    if (favoriteCommandIds.includes(command.id)) {
      // If it's a sub-command, we need to modify its name to show parent context
      if (parentName) {
        const resolvedName = await resolveAsyncProperty(command.name, context)

        // Create a new command object with the modified name
        const modifiedCommand: Command = {
          ...command,
          name: Array.isArray(resolvedName)
            ? resolvedName
            : [resolvedName!, parentName],
        }
        favoritedCommands.push(modifiedCommand)
      } else {
        favoritedCommands.push(command)
      }
    }

    // If this is a ParentCommand, recursively search its children
    if ("commands" in command) {
      try {
        const children = await command.commands(context)
        const commandName = await resolveAsyncProperty(command.name, context)
        const parentNameString = Array.isArray(commandName)
          ? commandName[0]
          : commandName!

        const favoritedChildren = await findFavoritedCommands(
          children,
          favoriteCommandIds,
          context,
          parentNameString,
        )
        favoritedCommands.push(...favoritedChildren)
      } catch (error) {
        console.error(
          `Error getting children for command ${command.id}:`,
          error,
        )
      }
    }
  }

  return favoritedCommands
}

// Helper function to process recent commands
const _processRecentCommands = async (
  allCommands: Command[],
  context: Browser.Context,
  addedCommandIds: Set<string>,
): Promise<Command[]> => {
  const recentResult: Command[] = []
  const recentCommandIds = (await getRankedCommandIds()).slice(0, 5)
  const allUsageStats = await getAllUsageStats()

  for (const recentId of recentCommandIds) {
    if (!addedCommandIds.has(recentId)) {
      const recentCommand = await findCommand(allCommands, recentId, context)

      if (recentCommand) {
        // Check if this command has stored parent context
        const usageStats = allUsageStats[recentId]
        if (usageStats?.parentNames && usageStats.parentNames.length > 0) {
          // Create command with breadcrumb name using parent context
          const resolvedName = await resolveAsyncProperty(
            recentCommand.name,
            context,
          )
          const commandWithBreadcrumbs: Command = {
            ...recentCommand,
            name: [resolvedName as string, ...usageStats.parentNames],
          }
          recentResult.push(commandWithBreadcrumbs)
        } else {
          recentResult.push(recentCommand)
        }
        addedCommandIds.add(recentId)
      }
    }
  }

  return recentResult
}

// Helper function to process suggestions (remaining commands ranked by usage)
const _processSuggestions = async (
  allCommands: Command[],
  addedCommandIds: Set<string>,
): Promise<Command[]> => {
  // Get usage-based ranking for suggestions
  const rankedCommandIds = await getRankedCommandIds()

  // Create a map for quick lookup of ranking position
  const rankingMap = new Map<string, number>()
  rankedCommandIds.forEach((id, index) => {
    rankingMap.set(id, index)
  })

  // Add remaining commands without duplicates, sorted by usage ranking
  const remainingCommands = allCommands.filter(
    (command) => !addedCommandIds.has(command.id),
  )

  // Sort remaining commands by their usage ranking (commands with no usage data go to the end)
  remainingCommands.sort((a, b) => {
    const rankA = rankingMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const rankB = rankingMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })

  return remainingCommands
}

// Function to get all commands, including dynamically generated ones
export const getCommands = async (): Promise<{
  favorites: Command[]
  recents: Command[]
  suggestions: Command[]
}> => {
  console.debug("[Commands] Starting getCommands()")

  const allCommands = loadAllCommands()
  console.debug(
    "[Commands] All commands loaded:",
    allCommands.length,
    allCommands.map((c) => c.id),
  )

  const favoriteResult: Command[] = []
  const recentResult: Command[] = []
  const suggestionsResult: Command[] = []
  const addedCommandIds = new Set<string>()

  // Add favorite commands first
  const favoriteCommandIds = await getFavoriteCommandIds()

  // Create a basic execution context for resolving command children
  const basicContext: Browser.Context = {
    url: "",
    title: "",
    modifierKey: null,
  }

  // Find all favorited commands including sub-commands
  const favoritedCommands = await findFavoritedCommands(
    allCommands,
    favoriteCommandIds,
    basicContext,
  )

  // Add favorited commands to results and track their IDs
  for (const favoriteCommand of favoritedCommands) {
    favoriteResult.push(favoriteCommand)
    addedCommandIds.add(favoriteCommand.id)
  }

  // Add recent commands second (excluding those already in favorites)
  const recentCommands = await _processRecentCommands(
    allCommands,
    basicContext,
    addedCommandIds,
  )
  recentResult.push(...recentCommands)

  // Process remaining commands as suggestions
  const suggestions = await _processSuggestions(allCommands, addedCommandIds)
  suggestionsResult.push(...suggestions)

  return {
    favorites: favoriteResult,
    recents: recentResult,
    suggestions: suggestionsResult,
  }
}

// Helper function to find a command with depth-first traversal
export const findCommand = async (
  commands: Command[],
  commandId: string,
  context: Browser.Context,
): Promise<Command | undefined> => {
  // First try to find the command directly in the current level
  const directCommand = commands.find((cmd) => cmd.id === commandId)
  if (directCommand) {
    return directCommand
  }

  // If not found, recursively search children of commands that have children
  for (const command of commands) {
    // Search through command children (ParentCommand)
    if ("commands" in command) {
      const children = await command.commands(context)
      const foundInChildren = await findCommand(children, commandId, context)
      if (foundInChildren) {
        return foundInChildren
      }
    }

    // Search through actions
    if (command.actions && Array.isArray(command.actions)) {
      const foundInActions = await findCommand(
        command.actions,
        commandId,
        context,
      )
      if (foundInActions) {
        return foundInActions
      }
    }
  }

  return undefined
}

// Helper function to find a CommandSuggestion (with execution context) from suggestions list
const findCommandSuggestion = (
  suggestions: CommandSuggestion[],
  commandId: string,
): CommandSuggestion | undefined => {
  // Search in suggestions and their actions recursively
  for (const suggestion of suggestions) {
    if (suggestion.id === commandId) {
      return suggestion
    }

    // Search in actions if they exist
    if (suggestion.actions && Array.isArray(suggestion.actions)) {
      const foundInActions = findCommandSuggestion(
        suggestion.actions,
        commandId,
      )
      if (foundInActions) {
        return foundInActions
      }
    }
  }

  return undefined
}

export const executeCommand = async (
  id: string,
  context: Browser.Context,
  formValues: Record<string, string>,
  parentNames?: string[],
): Promise<void> => {
  // Handle toggle favorite actions directly for nested commands
  if (id.startsWith("toggle-favorite-")) {
    const targetCommandId = id.replace("toggle-favorite-", "")
    await toggleFavoriteCommandId(targetCommandId)
    return
  }

  const { favorites, recents, suggestions } = await getCommands()
  const allSuggestions = await commandsToSuggestions(
    [...favorites, ...recents, ...suggestions],
    context,
  )

  // First, try to find the action in our CommandSuggestions (which have execution context)
  const actionSuggestion = findCommandSuggestion(allSuggestions, id)

  if (actionSuggestion?.executionContext) {
    const executionCtx = actionSuggestion.executionContext

    // Handle different action types using pattern matching
    return await match(executionCtx)
      .with({ type: "favorite" }, async (ctx) => {
        await toggleFavoriteCommandId(ctx.targetCommandId)
      })
      .with({ type: "primary" }, (ctx) => {
        const modifiedContext = {
          ...context,
        }
        return executeCommand(ctx.targetCommandId, modifiedContext, formValues)
      })
      .with({ type: "modifier" }, (ctx) => {
        const modifiedContext = {
          ...context,
          modifierKey: ctx.modifierKey,
        }
        return executeCommand(ctx.targetCommandId, modifiedContext, formValues)
      })
      .exhaustive()
  }

  // If no metadata found, fall back to the original command lookup
  const allCommands = [...favorites, ...recents, ...suggestions, debug]

  // Find and execute the command
  const commandToRun = await findCommand(allCommands, id, context)

  if (commandToRun) {
    if ("run" in commandToRun) {
      try {
        await commandToRun.run(context, formValues)

        // Only add to recents if the command doesn't have doNotAddToRecents flag
        if (!commandToRun.doNotAddToRecents) {
          await recordCommandUsage(id, parentNames)
        }

        return
      } catch (error) {
        console.error(`[ExecuteCommand] Error executing command ${id}:`, error)
        throw error
      }
    } else {
      console.error(
        `[ExecuteCommand] Command found but has no run method: ${id}`,
      )
      throw new Error(`Command ${id} is not executable`)
    }
  } else {
    console.error(`[ExecuteCommand] Command not found: ${id}`)
    throw new Error(`Command not found: ${id}`)
  }
}

// Helper to create toggle favorite action
const createFavoriteToggleAction = async (
  command: Command,
  favoriteCommandIds: string[],
): Promise<CommandSuggestion> => {
  const isFavorite = favoriteCommandIds.includes(command.id)
  return {
    id: `toggle-favorite-${command.id}`,
    name: isFavorite ? "Remove from Favorites" : "Add to Favorites",
    description: isFavorite
      ? "Remove this command from favorites"
      : "Add this command to favorites",
    icon: { type: "lucide", name: isFavorite ? "StarOff" : "Star" },
    color: "amber",
    isParentCommand: false,
    actionLabel: isFavorite ? "Remove" : "Add",
    keywords: ["favorite", "star", isFavorite ? "remove" : "add"],
    isFavorite: false,
    actions: undefined,
    remainOpenOnSelect: true,
    executionContext: {
      type: "favorite",
      targetCommandId: command.id,
    },
  }
}

// Helper to create primary action (default Enter key behavior)
const createPrimaryAction = async (
  command: Command,
  context: Browser.Context,
): Promise<CommandSuggestion | null> => {
  // Skip if command already has custom actions defined
  if (command.actions?.length) {
    return null
  }

  const isParentCommand = "commands" in command
  const hasUIForm = "ui" in command
  const resolvedActionLabel = await resolveActionLabel(command, context)

  // Determine action properties based on command type
  const getPrimaryActionProperties = () => {
    if (isParentCommand) {
      return {
        name: "Open",
        description: "Open this group",
        icon: "FolderOpen" as const,
        actionLabel: "Open",
      }
    }
    if (hasUIForm) {
      return {
        name: resolvedActionLabel,
        description: "Open UI",
        icon: "FormInput" as const,
        actionLabel: resolvedActionLabel,
      }
    }
    return {
      name: resolvedActionLabel,
      description: "Execute this command",
      icon: "Play" as const,
      actionLabel: resolvedActionLabel,
    }
  }

  const primaryActionProperties = getPrimaryActionProperties()
  return {
    id: `${command.id}-enter-action`,
    name: primaryActionProperties.name,
    description: primaryActionProperties.description,
    icon: { type: "lucide", name: primaryActionProperties.icon },
    isParentCommand: false,
    actionLabel: primaryActionProperties.actionLabel,
    isFavorite: false,
    actions: undefined,
    keybinding: "↵",
    executionContext: {
      type: "primary",
      targetCommandId: command.id,
    },
  }
}

// Helper to create modifier key actions
const createModifierKeyActions = async (
  command: Command,
  context: Browser.Context,
): Promise<CommandSuggestion[]> => {
  const isParentCommand = "commands" in command
  const hasUIForm = "ui" in command

  // Only create modifier actions for executable commands (not parent/UI commands)
  if (isParentCommand || hasUIForm) {
    return []
  }

  const modifierActions: CommandSuggestion[] = []
  const modifierLabels = await resolveModifierActionLabels(command, context)

  // Configuration for each modifier key
  const modifierKeyDefinitions = [
    { key: "cmd" as const, icon: "Command", symbol: "⌘", description: "Cmd" },
    {
      key: "shift" as const,
      icon: "ArrowUp",
      symbol: "⇧",
      description: "Shift",
    },
    { key: "alt" as const, icon: "Option", symbol: "⌥", description: "Alt" },
    {
      key: "ctrl" as const,
      icon: "SquareAsterisk",
      symbol: "⌃",
      description: "Ctrl",
    },
  ] as const

  for (const { key, icon, symbol, description } of modifierKeyDefinitions) {
    const label = modifierLabels[key]
    if (label) {
      modifierActions.push({
        id: `${command.id}-${key}-enter-action`,
        name: label,
        description: `Execute with ${description} key`,
        icon: { type: "lucide", name: icon },
        isParentCommand: false,
        actionLabel: label,
        keywords: [],
        isFavorite: false,
        actions: undefined,
        keybinding: `${symbol} ↵`,
        executionContext: {
          type: "modifier",
          targetCommandId: command.id,
          modifierKey: key,
        },
      })
    }
  }

  return modifierActions
}

// Helper to build command name for display
const buildCommandDisplayName = async (
  command: Command,
  context: Browser.Context,
  parentName?: string,
  favoriteCommandIds: string[] = [],
): Promise<string | string[]> => {
  const resolvedName = await resolveAsyncProperty(command.name, context)

  // Create name array if this is a favorited subcommand
  return parentName && favoriteCommandIds.includes(command.id)
    ? Array.isArray(resolvedName)
      ? resolvedName
      : [resolvedName || "Unnamed Command", parentName]
    : resolvedName || "Unnamed Command"
}

export const commandsToSuggestions = async (
  commands: Command[],
  context: Browser.Context,
  parentName?: string,
): Promise<CommandSuggestion[]> => {
  const favoriteCommandIds = await getFavoriteCommandIds()
  const commandSettings = await getAllCommandSettings()

  return await Promise.all(
    commands.map(async (command) => {
      // Process existing actions if they exist
      let actions: CommandSuggestion[] | undefined
      if (command.actions && Array.isArray(command.actions)) {
        const commandName = await resolveAsyncProperty(command.name, context)
        const resolvedParentName = Array.isArray(commandName)
          ? commandName[0]
          : commandName!
        actions = await commandsToSuggestions(
          command.actions,
          context,
          resolvedParentName,
        )
      }

      // Resolve display name
      const displayName = await buildCommandDisplayName(
        command,
        context,
        parentName,
        favoriteCommandIds,
      )

      // Create actions using helper functions
      const toggleFavoriteAction = await createFavoriteToggleAction(
        command,
        favoriteCommandIds,
      )
      const primaryAction = await createPrimaryAction(command, context)
      const modifierKeyActions = await createModifierKeyActions(
        command,
        context,
      )

      // Combine all actions: default Enter (if needed), modifier actions, custom actions, toggle favorite
      const allActions = [
        ...(primaryAction ? [primaryAction] : []),
        ...modifierKeyActions,
        ...(actions || []),
        toggleFavoriteAction,
      ]

      const isParentCommand = "commands" in command
      const resolvedActionLabel = await resolveActionLabel(command, context)
      const modifierLabels = await resolveModifierActionLabels(command, context)

      return {
        id: command.id,
        name: displayName,
        description: await resolveAsyncProperty(command.description, context),
        icon: await resolveAsyncProperty(command.icon, context),
        keywords: await resolveAsyncProperty(command.keywords, context),
        color: await resolveAsyncProperty(command.color, context),
        isParentCommand,
        ui: "ui" in command ? command.ui : undefined,
        actionLabel: resolvedActionLabel,
        modifierActionLabel: modifierLabels,
        actions: allActions,
        keybinding:
          commandSettings[command.id]?.keybinding || command.keybinding,
        isFavorite: favoriteCommandIds.includes(command.id),
      } as CommandSuggestion
    }),
  )
}
