import type { CommandUrlRulesSetting } from "../../shared/types"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { invalidateKeybindingEntriesCache } from "../keybindings/source"
import { invalidateSearchIndex } from "./searchIndex"
import {
  getCommandSettings,
  removeCommandSetting,
  updateCommandSettings,
  updateCommandUrlRules,
} from "./settings"

export const clearCommandKeybindingAndRefresh = async (
  commandId: string,
): Promise<void> => {
  await removeCommandSetting(commandId, "keybinding")
  await refreshKeybindingRegistry()
}

export const setCommandKeybindingAndRefresh = async (
  commandId: string,
  keybinding: string,
): Promise<void> => {
  await updateCommandSettings(commandId, { keybinding })
  await refreshKeybindingRegistry()
}

export const updateCommandUrlRulesAndInvalidate = async (
  commandId: string,
  urlRules: CommandUrlRulesSetting,
): Promise<void> => {
  await updateCommandUrlRules(commandId, urlRules)
  invalidateSearchIndex()
  // URL rules change which commands are visible to the keybinding source.
  invalidateKeybindingEntriesCache()
}

export const appendCommandDenyUrlRuleAndInvalidate = async (
  commandId: string,
  pattern: string,
): Promise<void> => {
  const currentSettings = (await getCommandSettings(commandId)) || {}
  const currentDenyUrls = currentSettings.urlRules?.denyUrls || []

  if (currentDenyUrls.includes(pattern)) {
    return
  }

  await updateCommandUrlRulesAndInvalidate(commandId, {
    denyUrls: [...currentDenyUrls, pattern],
  })
}

export const setCommandHiddenAndInvalidate = async (
  commandId: string,
  hidden: boolean,
): Promise<void> => {
  await updateCommandSettings(commandId, { hidden })
  await refreshKeybindingRegistry()
  invalidateSearchIndex()
}
