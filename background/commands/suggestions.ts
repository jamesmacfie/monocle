// Architecture: background command system. Node-to-Suggestion conversion —
// the boundary where background-owned CommandNodes (with executable
// functions) become UI-safe Suggestion values (data only; the palette never
// receives functions). Resolves AsyncValue presentation fields against the
// browser context, applies effective keybindings from CommandSettings, and
// attaches the generated per-row actions (run/modifier variants, favorite
// toggle, hide, hide-from-domain, set/reset keybinding) whose synthetic
// execution contexts are dispatched by background/commands/execution.ts.
// Split out of the old overloaded index.ts.
import type {
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  IconName,
  Suggestion,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import {
  allowsKeybinding,
  getKeybindingRequirements,
  isSettingsCatalogConfigurable,
  resolveActionLabel,
  resolveAsyncProperty,
  resolveModifierActionLabels,
} from "../utils/commands"
import { extractDomain } from "../utils/urlFilter"
import { getFavoriteCommandIds } from "./favorites"
import { mergePermissions } from "./query"
import { getAllCommandSettings } from "./settings"

// Helper to create set keybinding action
const createSetKeybindingAction = async (
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
      requirements: getKeybindingRequirements(command),
    },
  }
}

// Helper to create reset keybinding action
const createResetKeybindingAction = (
  command: CommandNode,
  settings?: CommandSettings,
): Suggestion | null => {
  if (!allowsKeybinding(command)) {
    return null
  }

  // Check if command has a custom keybinding set
  if (!settings?.keybinding) {
    return null // No custom keybinding to reset
  }

  return {
    id: `reset-keybinding-${command.id}`,
    name: "Reset Custom Keybinding",
    description: command.keybinding
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
  favoriteCommandIds: ReadonlySet<string>,
): Promise<Suggestion> => {
  const isFavorite = favoriteCommandIds.has(command.id)
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
const createHideFromDomainAction = async (
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

const createHideCommandAction = (command: CommandNode): Suggestion | null => {
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

/**
 * Converts command nodes into UI-facing suggestions: resolves async
 * presentation fields, computes the effective keybinding
 * (CommandSettings override > node default), and attaches the generated
 * row actions. Callers converting several batches per request (search
 * result groups) load favorites/settings once and pass them via
 * `preloaded`; everyone else gets the self-loading default.
 */
export const commandsToSuggestions = async (
  commands: Array<CommandNode>,
  context: Browser.Context,
  _parentName?: string,
  inheritedPermissions: BrowserPermission[] = [],
  preloaded?: {
    favoriteCommandIds: ReadonlySet<string>
    commandSettings: Record<string, CommandSettings>
  },
): Promise<Suggestion[]> => {
  const favoriteCommandIds =
    preloaded?.favoriteCommandIds ?? new Set(await getFavoriteCommandIds())
  const commandSettings =
    preloaded?.commandSettings ?? (await getAllCommandSettings())

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
              commandSettings[node.id]?.keybinding || node.keybinding || "",
            ) || undefined
          : undefined,
        isFavorite: favoriteCommandIds.has(node.id),
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
      const hideFromDomain = await createHideFromDomainAction(node, context)
      if (hideFromDomain) actions.push(hideFromDomain)
      const hideCommand = createHideCommandAction(node)
      if (hideCommand) actions.push(hideCommand)
      const setKB = await createSetKeybindingAction(node)
      const resetKB = createResetKeybindingAction(
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
