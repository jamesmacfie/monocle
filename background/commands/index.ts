import type {
  Browser,
  BrowserPermission,
  CommandExecutionScope,
  CommandNode,
  CommandSettings,
  IconName,
  Suggestion,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { showToast } from "../messages/showToast"
import {
  allowsKeybinding,
  isSettingsCatalogConfigurable,
  resolveActionLabel,
  resolveAsyncProperty,
  resolveModifierActionLabels,
} from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { createUrlPatternForDomain, extractDomain } from "../utils/urlFilter"
import { getFavoriteCommandIds, toggleFavoriteCommandId } from "./favorites"
import {
  type GeneratedCommandAction,
  parseGeneratedCommandAction,
} from "./generatedActions"
import {
  getCommandCollections,
  mergePermissions,
  normalizeContext,
  type ResolvedCommand,
  resolveCommandById,
  resolveCommandInPage,
} from "./query"
import { invalidateSearchIndex } from "./searchIndex"
import {
  getAllCommandSettings,
  getCommandSettings,
  removeCommandSetting,
  updateCommandSettings,
  updateCommandUrlRules,
} from "./settings"
import type { CommandLoadOptions } from "./source"
import { allCommands, loadAllCommands } from "./source"
import { recordCommandUsage } from "./usage"

export { allCommands, loadAllCommands }

export const getCommands = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<{
  favorites: CommandNode[]
  suggestions: CommandNode[]
}> => {
  return await getCommandCollections(context, options)
}

export const findCommand = async (
  _commands: CommandNode[],
  commandId: string,
  context: Browser.Context,
): Promise<CommandNode | undefined> => {
  return (await resolveCommandById(commandId, context))?.command
}

const showMissingPermissionsToast = async (
  missingPermissions: string[],
): Promise<void> => {
  const permissionList = missingPermissions
    .map(
      (permission) => permission.charAt(0).toUpperCase() + permission.slice(1),
    )
    .join(", ")

  await showToast({
    type: "show-toast",
    level: "error",
    message:
      "Missing permissions: " +
      permissionList +
      ". Please grant these permissions to use this command.",
  })
}

const normalizeFormValues = (
  formValues: Record<string, string | string[]> = {},
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(formValues).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(",") : (value ?? ""),
    ]),
  )
}

const shouldRecordUsage = (command: CommandNode): boolean => {
  if (command.type === "action") {
    return true
  }

  if (command.type === "submit") {
    return command.doNotAddToRecents !== true
  }

  return false
}

const executeResolvedCommand = async (
  resolved: ResolvedCommand,
  context: Browser.Context,
  formValues: Record<string, string | string[]>,
  parentNames?: string[],
): Promise<void> => {
  const { command, permissions } = resolved

  if (
    command.type !== "action" &&
    command.type !== "submit" &&
    command.type !== "search"
  ) {
    throw new Error(`Command ${command.id} is not executable`)
  }

  if (permissions.length > 0) {
    const { hasAllPermissions, missingPermissions } =
      await checkPermissions(permissions)

    if (!hasAllPermissions) {
      await showMissingPermissionsToast(missingPermissions)
      return
    }
  }

  try {
    await command.execute?.(context, normalizeFormValues(formValues))

    if (shouldRecordUsage(command)) {
      await recordCommandUsage(command.id, parentNames ?? resolved.parentNames)
    }
  } catch (error) {
    console.error(
      `[ExecuteCommand] Error executing action ${command.id}:`,
      error,
    )
    throw error
  }
}

const resolveGeneratedActionTarget = async (
  action: GeneratedCommandAction,
  context: Browser.Context,
  executionScope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<ResolvedCommand> => {
  const resolved = await resolveCommandInPage(
    action.targetCommandId,
    context,
    executionScope,
    options,
  )

  if (!resolved) {
    throw new Error(`Command not found: ${action.targetCommandId}`)
  }

  return resolved
}

const executeGeneratedAction = async (
  action: GeneratedCommandAction,
  context: Browser.Context,
  formValues: Record<string, string | string[]>,
  parentNames?: string[],
  executionScope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<void> => {
  const resolved = await resolveGeneratedActionTarget(
    action,
    context,
    executionScope,
    options,
  )

  if (action.type === "favorite") {
    await toggleFavoriteCommandId(action.targetCommandId)
    return
  }

  if (action.type === "setKeybinding") {
    console.warn(
      "setKeybinding action should be handled in UI layer, not background script",
    )
    return
  }

  if (action.type === "resetKeybinding") {
    await removeCommandSetting(action.targetCommandId, "keybinding")
    await refreshKeybindingRegistry()
    return
  }

  if (action.type === "hideDomain") {
    if (!context.url || context.isNewTab) {
      return
    }

    const domain = extractDomain(context.url)
    if (!domain) {
      return
    }

    const pattern = createUrlPatternForDomain(domain)
    const currentSettings =
      (await getCommandSettings(action.targetCommandId)) || {}
    const currentDenyUrls = currentSettings.urlRules?.denyUrls || []

    if (!currentDenyUrls.includes(pattern)) {
      await updateCommandUrlRules(action.targetCommandId, {
        denyUrls: [...currentDenyUrls, pattern],
      })
    }

    return
  }

  if (action.type === "hideCommand") {
    if (!isSettingsCatalogConfigurable(resolved.command)) {
      return
    }

    await updateCommandSettings(action.targetCommandId, {
      hidden: true,
    })
    await refreshKeybindingRegistry()
    invalidateSearchIndex()
    return
  }

  if (action.type === "primary") {
    if (resolved.command.type === "group") {
      return
    }

    await executeResolvedCommand(resolved, context, formValues, parentNames)
    return
  }

  await executeResolvedCommand(
    resolved,
    {
      ...context,
      modifierKey: action.modifierKey,
    },
    formValues,
    parentNames,
  )
}

export const executeCommand = async (
  id: string,
  context: Browser.Context,
  formValues: Record<string, string | string[]>,
  parentNames?: string[],
  executionScope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<void> => {
  const normalizedContext = normalizeContext(context)
  const generatedAction = parseGeneratedCommandAction(id)

  if (generatedAction) {
    await executeGeneratedAction(
      generatedAction,
      normalizedContext,
      formValues,
      parentNames,
      executionScope,
      options,
    )
    return
  }

  const resolved = executionScope
    ? await resolveCommandInPage(id, normalizedContext, executionScope, options)
    : await resolveCommandById(id, normalizedContext, options)

  if (!resolved) {
    console.error(`[ExecuteCommand] Command not found: ${id}`)
    throw new Error(`Command not found: ${id}`)
  }

  await executeResolvedCommand(
    resolved,
    normalizedContext,
    formValues,
    parentNames,
  )
}

// Helper to create set keybinding action
const _createSetKeybindingAction = async (
  command: CommandNode,
): Promise<Suggestion | null> => {
  if (!allowsKeybinding(command)) {
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
const _createResetKeybindingAction = (
  command: CommandNode,
  settings?: CommandSettings,
): Suggestion | null => {
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
  if (!settings?.keybinding) {
    return null // No custom keybinding to reset
  }

  return {
    id: `reset-keybinding-${command.id}`,
    name: "Reset Custom Keybinding",
    description:
      (command.type === "action" || command.type === "submit") &&
      command.keybinding
        ? `Reset to default keybinding: ${normalizeKeybinding(command.keybinding)}`
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

// Helper to create hide from domain action
const _createHideFromDomainAction = async (
  command: CommandNode,
  context: Browser.Context,
): Promise<Suggestion | null> => {
  // Only show if we have a valid URL (not new tab page)
  if (!context.url || context.url === "" || context.isNewTab) {
    return null
  }

  // Extract domain from current URL
  const domain = extractDomain(context.url)

  if (!domain) {
    return null
  }

  return {
    id: `hide-from-domain-${command.id}`,
    name: `Hide from ${domain}`,
    description: `Hide this command from all pages on ${domain}`,
    icon: { type: "lucide", name: "EyeOff" },
    color: "red",
    type: "action",
    actionLabel: "Hide",
    keywords: ["hide", "block", "domain", "filter"],
    isFavorite: false,
    actions: undefined,
    remainOpenOnSelect: true,
    executionContext: {
      type: "hideDomain",
      targetCommandId: command.id,
      domain: domain,
    },
  }
}

const _createHideCommandAction = (command: CommandNode): Suggestion | null => {
  if (!isSettingsCatalogConfigurable(command)) {
    return null
  }

  return {
    id: `hide-command-${command.id}`,
    name: "Hide Command",
    description: "Hide this command from Monocle",
    icon: { type: "lucide", name: "EyeOff" },
    color: "red",
    type: "action",
    actionLabel: "Hide",
    keywords: ["hide", "command", "disable"],
    isFavorite: false,
    actions: undefined,
    remainOpenOnSelect: true,
    executionContext: {
      type: "hideCommand",
      targetCommandId: command.id,
    },
  }
}

export const commandsToSuggestions = async (
  commands: Array<CommandNode>,
  context: Browser.Context,
  _parentName?: string,
  inheritedPermissions: BrowserPermission[] = [],
): Promise<Suggestion[]> => {
  const favoriteCommandIds = await getFavoriteCommandIds()
  const commandSettings = await getAllCommandSettings()

  return await Promise.all(
    commands.map(async (command) => {
      const node = command
      const effectivePermissions = mergePermissions(
        inheritedPermissions,
        node.permissions,
      )
      const baseName = await resolveAsyncProperty(node.name, context)
      const displayName = (baseName ?? "Unnamed Command") as string

      const baseProps = {
        id: node.id,
        name: displayName,
        description: await resolveAsyncProperty(node.description, context),
        executionPayload: await resolveAsyncProperty(
          node.executionPayload,
          context,
        ),
        icon: await resolveAsyncProperty(node.icon, context),
        keywords: await resolveAsyncProperty(node.keywords, context),
        color: (await resolveAsyncProperty(node.color, context)) as any,
        keybinding: allowsKeybinding(node)
          ? normalizeKeybinding(
              commandSettings[node.id]?.keybinding ||
                (node.type === "action" || node.type === "submit"
                  ? node.keybinding
                  : undefined) ||
                "",
            ) || undefined
          : undefined,
        isFavorite: favoriteCommandIds.includes(node.id),
        permissions: effectivePermissions,
      }

      // Resolved once and reused for both the suggestion and its modifier actions
      const modifierActionLabels =
        node.type === "action" || node.type === "submit"
          ? await resolveModifierActionLabels(node, context)
          : undefined

      let suggestion: Suggestion

      if (node.type === "action") {
        suggestion = {
          ...baseProps,
          type: "action",
          actionLabel: await resolveActionLabel(node, context),
          modifierActionLabel: modifierActionLabels,
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
          modifierActionLabel: modifierActionLabels,
          confirmAction: node.confirmAction,
          remainOpenOnSelect: node.remainOpenOnSelect,
          executionContext: undefined,
          actions: undefined,
        }
      } else if (node.type === "search") {
        suggestion = {
          ...baseProps,
          type: "search",
          actionLabel: await resolveActionLabel(node, context),
          actions: undefined,
        } as any
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
        node.type === "search" ||
        node.type === "action" ||
        node.type === "submit"
      ) {
        const primaryLabel =
          node.type === "group"
            ? "Open"
            : await resolveActionLabel(node as any, context)
        actions.push({
          id: `${node.id}-enter-action`,
          name: primaryLabel,
          description: node.type === "group" ? "Open this group" : primaryLabel,
          icon: {
            type: "lucide",
            name: node.type === "group" ? "FolderOpen" : "Play",
          },
          type: "action",
          actionLabel: primaryLabel,
          isFavorite: false,
          actions: undefined,
          keybinding: "enter",
          confirmAction:
            node.type === "action" || node.type === "submit"
              ? node.confirmAction
              : undefined,
          permissions: effectivePermissions,
          executionContext: { type: "primary", targetCommandId: node.id },
        })
      }
      if (
        (node.type === "action" || node.type === "submit") &&
        modifierActionLabels
      ) {
        const modifierLabels = modifierActionLabels
        const defs: Array<{
          key: "cmd" | "shift" | "alt" | "ctrl"
          icon: IconName
          symbol: string
          description: string
        }> = [
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
        for (const { key, icon, description } of defs) {
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
              keybinding: `<${key}-enter>`,
              confirmAction: node.confirmAction,
              modifierActionLabel: undefined,
              remainOpenOnSelect: undefined,
              actions: undefined,
              permissions: effectivePermissions,
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
      const hideFromDomain = await _createHideFromDomainAction(node, context)
      if (hideFromDomain) actions.push(hideFromDomain)
      const hideCommand = _createHideCommandAction(node)
      if (hideCommand) actions.push(hideCommand)
      const setKB = await _createSetKeybindingAction(node)
      const resetKB = _createResetKeybindingAction(
        node,
        commandSettings[node.id],
      )
      if (setKB) actions.push(setKB)
      if (resetKB) actions.push(resetKB)
      if (
        suggestion.type === "action" ||
        suggestion.type === "submit" ||
        suggestion.type === "group" ||
        suggestion.type === "search"
      ) {
        suggestion.actions = actions
      }
      return suggestion
    }),
  )
}
