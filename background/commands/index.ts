import type { Command, CommandSuggestion, ExecutionContext } from "../../types"
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
import { toolCommands } from "./tools"
import {
  addToRecentCommandIds,
  getRankedCommandIds,
  getRecentCommandIds,
} from "./usage"

// Function to get all commands, including dynamically generated ones
export const getCommands = async (): Promise<{
  favorites: Command[]
  recents: Command[]
  suggestions: Command[]
}> => {
  console.debug("[Commands] Starting getCommands()")

  // First load in common browser commands
  const allCommandsUnfiltered = [
    ...browserCommands,
    ...toolCommands,
    clearRecentsCommand,
    clearFavoritesCommand,
    debug,
  ]
  console.debug(
    "[Commands] All commands unfiltered:",
    allCommandsUnfiltered.length,
    allCommandsUnfiltered.map((c) => c.id),
  )

  // Then, go and grab browser specific commands
  if (isFirefox) {
    allCommandsUnfiltered.push(...firefoxCommands)
  }

  // Filter commands based on browser compatibility
  const allCommands = allCommandsUnfiltered.filter((command) => {
    // If no browsers property is defined, the command works everywhere
    if (!command.supportedBrowsers) {
      return true
    }

    // Check if the command works in the current browser
    return isFirefox
      ? command.supportedBrowsers.includes("firefox")
      : command.supportedBrowsers.includes("chrome")
  })

  const favoriteResult: Command[] = []
  const recentResult: Command[] = []
  const suggestionsResult: Command[] = []
  const addedCommandIds = new Set<string>()

  // Helper function to find command by ID
  const findCommandById = (
    commands: Command[],
    id: string,
  ): Command | undefined => {
    for (const cmd of commands) {
      if (cmd.id === id) return cmd
    }
    return undefined
  }

  // Helper function to recursively find all favorited commands including sub-commands
  const findFavoritedCommands = async (
    commands: Command[],
    favoriteCommandIds: string[],
    context: ExecutionContext,
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

  // Add favorite commands first
  const favoriteCommandIds = await getFavoriteCommandIds()

  // Create a basic execution context for resolving command children
  const basicContext: ExecutionContext = {
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
  const recentCommandIds = await getRecentCommandIds()
  for (const recentId of recentCommandIds) {
    if (!addedCommandIds.has(recentId)) {
      const recentCommand = findCommandById(allCommands, recentId)
      if (recentCommand) {
        recentResult.push(recentCommand)
        addedCommandIds.add(recentId)
      }
    }
  }

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

  suggestionsResult.push(...remainingCommands)

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
  context: ExecutionContext,
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

export const executeCommand = async (
  id: string,
  context: ExecutionContext,
  formValues: Record<string, string>,
) => {
  // Check if this is a toggle favorite action
  if (id.startsWith("toggle-favorite-")) {
    const originalCommandId = id.replace("toggle-favorite-", "")
    const _newState = await toggleFavoriteCommandId(originalCommandId)
    return
  }

  const { favorites, recents, suggestions } = await getCommands()
  const allCommands = [...favorites, ...recents, ...suggestions, debug]

  // Find and execute the command
  const commandToRun = await findCommand(allCommands, id, context)

  if (commandToRun) {
    if ("run" in commandToRun) {
      try {
        await commandToRun.run(context, formValues)

        // Only add to recents if the command doesn't have doNotAddToRecents flag
        if (!commandToRun.doNotAddToRecents) {
          await addToRecentCommandIds(id)
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

export const commandsToSuggestions = async (
  commands: Command[],
  context: ExecutionContext,
  parentName?: string,
): Promise<CommandSuggestion[]> => {
  const favoriteCommandIds = await getFavoriteCommandIds()

  return await Promise.all(
    commands.map(async (command) => {
      // Process actions if they exist
      let actions: CommandSuggestion[] | undefined
      if (command.actions && Array.isArray(command.actions)) {
        const commandName = await resolveAsyncProperty(command.name, context)
        // Pass the resolved name as parentName for actions
        const resolvedParentName = Array.isArray(commandName)
          ? commandName[0]
          : commandName!
        actions = await commandsToSuggestions(
          command.actions,
          context,
          resolvedParentName,
        )
      }

      // Resolve the command name (could be string, array, or function returning either)
      const resolvedName = await resolveAsyncProperty(command.name, context)

      // Create name array if this is a favorited subcommand
      const displayName =
        parentName && favoriteCommandIds.includes(command.id)
          ? Array.isArray(resolvedName)
            ? resolvedName
            : [resolvedName!, parentName]
          : resolvedName

      const isFavorite = favoriteCommandIds.includes(command.id)

      // Create toggle favorite action directly as CommandSuggestion to avoid recursion
      const toggleFavoriteAction: CommandSuggestion = {
        id: `toggle-favorite-${command.id}`,
        name: isFavorite ? "Remove from Favorites" : "Add to Favorites",
        description: isFavorite
          ? "Remove this command from favorites"
          : "Add this command to favorites",
        icon: { name: isFavorite ? "StarOff" : "Star" },
        color: "amber",
        hasCommands: false,
        actionLabel: isFavorite ? "Remove" : "Add",
        keybinding: "⌘ F",
        keywords: ["favorite", "star", isFavorite ? "remove" : "add"],
        isFavorite: false,
        actions: undefined,
      }

      // Combine existing actions with toggle favorite action
      const allActions = actions
        ? [...actions, toggleFavoriteAction]
        : [toggleFavoriteAction]

      return {
        id: command.id,
        name: displayName,
        description: await resolveAsyncProperty(command.description, context),
        icon: await resolveAsyncProperty(command.icon, context),
        keywords: await resolveAsyncProperty(command.keywords, context),
        color: await resolveAsyncProperty(command.color, context),
        hasCommands: "commands" in command,
        ui: "ui" in command ? command.ui : undefined,
        actionLabel: await resolveActionLabel(command, context),
        modifierActionLabel: await resolveModifierActionLabels(
          command,
          context,
        ),
        actions: allActions,
        keybinding: command.keybinding,
        isFavorite: favoriteCommandIds.includes(command.id),
      } as CommandSuggestion
    }),
  )
}
