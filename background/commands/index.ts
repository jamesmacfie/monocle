import { match } from "ts-pattern"
import type { Browser, CommandNode, Suggestion } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"
import {
  resolveActionLabel,
  resolveAsyncProperty,
  resolveModifierActionLabels,
} from "../utils/commands"
import { browserCommands, firefoxCommands } from "./browser"
import {
  clearFavoritesCommand,
  getFavoriteCommandIds,
  toggleFavoriteCommandId,
} from "./favorites"
import { newTabCommands } from "./newTab"
import { clearRecentsCommand } from "./recents"
import { getAllCommandSettings } from "./settings"
import { toolCommands } from "./tools"
import {
  getAllUsageStats,
  getRankedCommandIds,
  recordCommandUsage,
} from "./usage"

// Helper function to load and filter all commands
const loadAllCommands = (context?: Browser.Context): Array<CommandNode> => {
  // First load in common browser commands
  const allCommandsUnfiltered = [
    ...browserCommands,
    ...toolCommands,
    clearRecentsCommand,
    clearFavoritesCommand,
  ]

  // Add new tab specific commands only if on new tab page
  if (context?.isNewTab) {
    allCommandsUnfiltered.push(...newTabCommands)
  }

  // Then, go and grab browser specific commands
  if (isFirefox) {
    allCommandsUnfiltered.push(...firefoxCommands)
  }

  // Filter commands based on browser compatibility
  return allCommandsUnfiltered.filter((command) => {
    // If no browsers property is defined, the command works everywhere
    if (!("supportedBrowsers" in command) || !command.supportedBrowsers) {
      return true
    }

    // Check if the command works in the current browser
    return isFirefox
      ? command.supportedBrowsers.includes("firefox")
      : command.supportedBrowsers.includes("chrome")
  })
}

// Export all commands for use in other modules (without context for general use)
export const allCommands = loadAllCommands()

// Helper function to recursively find all favorited commands including sub-commands
const findFavoritedCommands = async (
  commands: Array<CommandNode>,
  favoriteCommandIds: string[],
  context: Browser.Context,
  parentName?: string,
): Promise<Array<CommandNode>> => {
  const favoritedCommands: Array<CommandNode> = []

  for (const command of commands) {
    // Check if this command is favorited
    if (favoriteCommandIds.includes(command.id)) {
      // If it's a sub-command, we need to modify its name to show parent context
      if (parentName) {
        const resolvedName = await resolveAsyncProperty(command.name, context)

        // Create a new command object with the modified name
        const modifiedCommand = {
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
    if (command.type === "group") {
      try {
        const children = await command.children(context)
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
  allCommands: Array<CommandNode>,
  context: Browser.Context,
  addedCommandIds: Set<string>,
): Promise<Array<CommandNode>> => {
  const recentResult: Array<CommandNode> = []
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
          const commandWithBreadcrumbs: any = {
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
  allCommands: Array<CommandNode>,
  addedCommandIds: Set<string>,
): Promise<Array<CommandNode>> => {
  // Get usage-based ranking for suggestions
  const rankedCommandIds = await getRankedCommandIds()

  // Create a map for quick lookup of ranking position
  const rankingMap = new Map<string, number>()
  rankedCommandIds.forEach((id, index) => {
    rankingMap.set(id, index)
  })

  // Add remaining commands without duplicates, sorted by usage ranking
  const remainingCommands = allCommands.filter(
    (command: any) => !addedCommandIds.has(command.id),
  )

  // Sort remaining commands by their usage ranking (commands with no usage data go to the end)
  remainingCommands.sort((a: any, b: any) => {
    const rankA = rankingMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const rankB = rankingMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })

  return remainingCommands
}

// Function to get all commands, including dynamically generated ones
export const getCommands = async (
  context?: Browser.Context,
): Promise<{
  favorites: Array<CommandNode>
  recents: Array<CommandNode>
  suggestions: Array<CommandNode>
}> => {
  console.debug("[Commands] Starting getCommands()")

  const allCommands = loadAllCommands(context)
  console.debug(
    "[Commands] All commands loaded:",
    allCommands.length,
    allCommands.map((c) => c.id),
  )

  const favoriteResult: Array<CommandNode> = []
  const recentResult: Array<CommandNode> = []
  const suggestionsResult: Array<CommandNode> = []
  const addedCommandIds = new Set<string>()

  // Add favorite commands first
  const favoriteCommandIds = await getFavoriteCommandIds()

  // Create a basic execution context for resolving command children
  // Preserve the isNewTab flag from the input context
  const basicContext: Browser.Context = {
    url: "",
    title: "",
    modifierKey: null,
    isNewTab: context?.isNewTab,
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
  commands: Array<CommandNode>,
  commandId: string,
  context: Browser.Context,
): Promise<CommandNode | undefined> => {
  // First try to find the command directly in the current level
  const directCommand = commands.find((cmd) => cmd.id === commandId)
  if (directCommand) {
    return directCommand
  }

  // If not found, recursively search children of commands that have children
  for (const command of commands) {
    // Group node children
    if (command.type === "group") {
      const children = await command.children(context)
      const foundInChildren = await findCommand(
        children as Array<CommandNode>,
        commandId,
        context,
      )
      if (foundInChildren) {
        return foundInChildren
      }
    }

    // No action search at node level (actions are created dynamically)
  }

  return undefined
}

// Helper function to find a Suggestion (with execution context) from suggestions list
const findCommandSuggestion = (
  suggestions: Suggestion[],
  commandId: string,
): Suggestion | undefined => {
  // Search in suggestions and their actions recursively
  for (const suggestion of suggestions) {
    if (suggestion.id === commandId) {
      return suggestion
    }

    // Search in actions if they exist
    if (
      (suggestion.type === "action" ||
        suggestion.type === "submit" ||
        suggestion.type === "group") &&
      suggestion.actions &&
      Array.isArray(suggestion.actions)
    ) {
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

  const { favorites, recents, suggestions } = await getCommands(context)
  const allSuggestions = await commandsToSuggestions(
    [...favorites, ...recents, ...suggestions],
    context,
  )

  // First, try to find the action in our Suggestions (which have execution context)
  const actionSuggestion = findCommandSuggestion(allSuggestions, id)

  if (
    (actionSuggestion?.type === "action" ||
      actionSuggestion?.type === "submit") &&
    actionSuggestion.executionContext
  ) {
    const executionCtx = actionSuggestion.executionContext

    // Handle different action types using pattern matching
    return await match(executionCtx)
      .with({ type: "favorite" }, async (ctx) => {
        await toggleFavoriteCommandId(ctx.targetCommandId)
      })
      .with({ type: "setKeybinding" }, (_ctx) => {
        // setKeybinding actions are handled entirely in the UI layer via Redux
        // They should not reach the background script's executeCommand function
        console.warn(
          "setKeybinding action should be handled in UI layer, not background script",
        )
        return Promise.resolve()
      })
      .with({ type: "resetKeybinding" }, async (ctx) => {
        // Reset custom keybinding by clearing it from settings
        const { removeCommandSettings } = require("./settings")
        await removeCommandSettings(ctx.targetCommandId)

        // Refresh keybinding registry to use default keybinding
        const { refreshKeybindingRegistry } = require("../keybindings/registry")
        await refreshKeybindingRegistry()

        return Promise.resolve()
      })
      .with({ type: "primary" }, async (ctx) => {
        const targetCommand = await findCommand(
          [...favorites, ...recents, ...suggestions],
          ctx.targetCommandId,
          context,
        )

        // If this is a group, we shouldn't execute it - the UI should navigate instead
        if (targetCommand && targetCommand.type === "group") {
          return Promise.resolve()
        }

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
  const allCommands = [...favorites, ...recents, ...suggestions]

  // Find and execute the command
  const commandToRun = await findCommand(allCommands as any, id, context)

  if (commandToRun) {
    if (commandToRun.type === "action" || commandToRun.type === "submit") {
      // Check permissions before executing the command
      if (commandToRun.permissions) {
        const { checkPermissions } = require("../utils/permissions")
        const { showToast } = require("../messages/showToast")

        const { hasAllPermissions, missingPermissions } =
          await checkPermissions(commandToRun.permissions)

        if (!hasAllPermissions) {
          const permissionList = missingPermissions
            .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(", ")

          await showToast({
            type: "show-toast",
            level: "error",
            message: `Missing permissions: ${permissionList}. Please grant these permissions to use this command.`,
          })

          return
        }
      }

      try {
        await commandToRun.execute(context, formValues)
        if (commandToRun.type === "action") {
          await recordCommandUsage(id, parentNames)
        }
        return
      } catch (error) {
        console.error(`[ExecuteCommand] Error executing action ${id}:`, error)
        throw error
      }
    } else {
      throw new Error(`Command ${id} is not executable`)
    }
  } else {
    console.error(`[ExecuteCommand] Command not found: ${id}`)
    throw new Error(`Command not found: ${id}`)
  }
}

// Helper to create set keybinding action
const _createSetKeybindingAction = async (
  command: CommandNode,
): Promise<Suggestion | null> => {
  // Don't create action for groups
  if (command.type === "group") {
    return null
  }

  // Don't create action if command explicitly opts out
  if (
    (command.type === "action" || command.type === "submit") &&
    command.allowCustomKeybinding === false
  ) {
    return null
  }

  return {
    id: `set-keybinding-${command.id}`,
    name: "Set Custom Keybinding",
    description: "Set a custom keyboard shortcut for this command",
    icon: { type: "lucide", name: "Keyboard" },
    color: "blue",
    type: "action",
    actionLabel: "Set Keybinding",
    keywords: ["keybinding", "keyboard", "shortcut", "hotkey"],
    isFavorite: false,
    actions: undefined,
    remainOpenOnSelect: true,
    executionContext: {
      type: "setKeybinding",
      targetCommandId: command.id,
    },
  }
}

// Helper to create reset keybinding action
const _createResetKeybindingAction = async (
  command: CommandNode,
): Promise<Suggestion | null> => {
  // Don't create action for groups
  if (command.type === "group") {
    return null
  }

  // Don't create action if command explicitly opts out
  if (
    (command.type === "action" || command.type === "submit") &&
    command.allowCustomKeybinding === false
  ) {
    return null
  }

  // Check if command has a custom keybinding set
  const { getCommandSettings } = require("./settings")
  const settings = await getCommandSettings(command.id)
  if (!settings?.keybinding) {
    return null // No custom keybinding to reset
  }

  return {
    id: `reset-keybinding-${command.id}`,
    name: "Reset Custom Keybinding",
    description:
      (command.type === "action" || command.type === "submit") &&
      command.keybinding
        ? `Reset to default keybinding: ${command.keybinding}`
        : "Reset to default keybinding",
    icon: { type: "lucide", name: "RotateCcw" },
    color: "orange",
    type: "action",
    actionLabel: "Reset Keybinding",
    keywords: ["reset", "keybinding", "default", "clear"],
    isFavorite: false,
    actions: undefined,
    remainOpenOnSelect: false,
    executionContext: {
      type: "resetKeybinding",
      targetCommandId: command.id,
    },
  }
}

// Helper to create toggle favorite action
const createFavoriteToggleAction = async (
  command: CommandNode,
  favoriteCommandIds: string[],
): Promise<Suggestion> => {
  const isFavorite = favoriteCommandIds.includes(command.id)
  return {
    id: `toggle-favorite-${command.id}`,
    name: isFavorite ? "Remove from Favorites" : "Add to Favorites",
    description: isFavorite
      ? "Remove this command from favorites"
      : "Add this command to favorites",
    icon: { type: "lucide", name: isFavorite ? "StarOff" : "Star" },
    color: "amber",
    type: "action",
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

export const commandsToSuggestions = async (
  commands: Array<CommandNode>,
  context: Browser.Context,
  _parentName?: string,
): Promise<Suggestion[]> => {
  const favoriteCommandIds = await getFavoriteCommandIds()
  const commandSettings = await getAllCommandSettings()

  return await Promise.all(
    commands.map(async (command) => {
      const node = command
      const baseName = await resolveAsyncProperty(node.name, context)
      const displayName = (baseName ?? "Unnamed Command") as string

      const baseProps = {
        id: node.id,
        name: displayName,
        description: await resolveAsyncProperty(node.description, context),
        icon: await resolveAsyncProperty(node.icon, context),
        keywords: await resolveAsyncProperty(node.keywords, context),
        color: (await resolveAsyncProperty(node.color, context)) as any,
        keybinding:
          commandSettings[node.id]?.keybinding ||
          (node.type === "action" ? node.keybinding : undefined),
        isFavorite: favoriteCommandIds.includes(node.id),
        permissions: node.permissions,
      }

      let suggestion: Suggestion

      if (node.type === "action") {
        suggestion = {
          ...baseProps,
          type: "action",
          actionLabel: await resolveActionLabel(node, context),
          modifierActionLabel: await resolveModifierActionLabels(node, context),
          confirmAction: node.confirmAction,
          remainOpenOnSelect: node.remainOpenOnSelect,
          executionContext: undefined,
          actions: undefined,
        }
      } else if (node.type === "submit") {
        suggestion = {
          ...baseProps,
          type: "submit",
          actionLabel: await resolveActionLabel(node, context),
          modifierActionLabel: await resolveModifierActionLabels(node, context),
          confirmAction: node.confirmAction,
          remainOpenOnSelect: node.remainOpenOnSelect,
          executionContext: undefined,
          actions: undefined,
        }
      } else if (node.type === "group") {
        suggestion = {
          ...baseProps,
          type: "group",
          actionLabel: "Open",
          actions: undefined,
        }
      } else if (node.type === "input") {
        suggestion = {
          ...baseProps,
          type: "input",
          inputField: node.field,
          actionLabel: undefined,
        }
      } else {
        suggestion = {
          ...baseProps,
          type: "display",
          actionLabel: undefined,
        }
      }

      const actions: Suggestion[] = []
      if (
        node.type === "group" ||
        node.type === "action" ||
        node.type === "submit"
      ) {
        const primaryLabel =
          node.type === "group"
            ? "Open"
            : await resolveActionLabel(node, context)
        actions.push({
          id: `${node.id}-enter-action`,
          name: primaryLabel,
          description:
            node.type === "group" ? "Open this group" : "Execute this command",
          icon: {
            type: "lucide",
            name: node.type === "group" ? "FolderOpen" : "Play",
          },
          type: "action",
          actionLabel: primaryLabel,
          isFavorite: false,
          actions: undefined,
          keybinding: "↵",
          confirmAction:
            node.type === "action" || node.type === "submit"
              ? node.confirmAction
              : undefined,
          executionContext: { type: "primary", targetCommandId: node.id },
        })
      }
      if (node.type === "action" || node.type === "submit") {
        const modifierLabels = await resolveModifierActionLabels(node, context)
        const defs = [
          {
            key: "cmd" as const,
            icon: "Command",
            symbol: "⌘",
            description: "Cmd",
          },
          {
            key: "shift" as const,
            icon: "ArrowUp",
            symbol: "⇧",
            description: "Shift",
          },
          {
            key: "alt" as const,
            icon: "Option",
            symbol: "⌥",
            description: "Alt",
          },
          {
            key: "ctrl" as const,
            icon: "SquareAsterisk",
            symbol: "⌃",
            description: "Ctrl",
          },
        ]
        for (const { key, icon, symbol, description } of defs) {
          const label = modifierLabels[key]
          if (label) {
            actions.push({
              id: `${node.id}-${key}-enter-action`,
              name: label,
              description: `Execute with ${description} key`,
              icon: { type: "lucide", name: icon },
              type: "action",
              actionLabel: label,
              keywords: [],
              isFavorite: false,
              keybinding: `${symbol} ↵`,
              confirmAction: node.confirmAction,
              modifierActionLabel: undefined,
              remainOpenOnSelect: undefined,
              actions: undefined,
              permissions: undefined,
              color: undefined,
              executionContext: {
                type: "modifier",
                targetCommandId: node.id,
                modifierKey: key,
              },
            })
          }
        }
      }
      actions.push(await createFavoriteToggleAction(node, favoriteCommandIds))
      const setKB = await _createSetKeybindingAction(node)
      const resetKB = await _createResetKeybindingAction(node)
      if (setKB) actions.push(setKB)
      if (resetKB) actions.push(resetKB)
      if (
        suggestion.type === "action" ||
        suggestion.type === "submit" ||
        suggestion.type === "group"
      ) {
        suggestion.actions = actions
      }
      return suggestion
    }),
  )
}
