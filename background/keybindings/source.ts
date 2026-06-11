import type {
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  KeybindingBehavior,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import {
  getFilteredRootCommands,
  mergePermissions,
  normalizeContext,
  resolveCommandById,
} from "../commands/query"
import { getAllCommandSettings } from "../commands/settings"
import type { CommandLoadOptions } from "../commands/source"
import {
  allowsKeybinding,
  getKeybindingBehavior,
  resolveCommandName,
} from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { filterCommandsByUrl } from "../utils/urlFilter"

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

const getCommandKeybinding = (
  command: CommandNode,
  commandSettings: Record<string, CommandSettings>,
): string => {
  if (!allowsKeybinding(command)) {
    return ""
  }

  const configuredKeybinding = commandSettings[command.id]?.keybinding
  const defaultKeybinding = command.keybinding

  return normalizeKeybinding(configuredKeybinding || defaultKeybinding || "")
}

const addKeybindingEntry = async (
  entries: KeybindingCommandEntry[],
  seenEntries: Set<string>,
  command: CommandNode,
  context: Browser.Context,
  commandSettings: Record<string, CommandSettings>,
): Promise<void> => {
  const keybinding = getCommandKeybinding(command, commandSettings)
  if (!keybinding) return

  const entryKey = `${command.id}:${keybinding}`
  if (seenEntries.has(entryKey)) return

  seenEntries.add(entryKey)
  entries.push({
    id: command.id,
    name: await resolveCommandName(command.name, context),
    keybinding,
    behavior: getKeybindingBehavior(command),
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

export const loadKeybindingCommandEntries = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<KeybindingCommandEntry[]> => {
  const normalizedContext = normalizeContext(context)
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
