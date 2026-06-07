import type {
  CommandUrlRulesSetting,
  UpdateCommandSettingMessage,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { resolveCommandById } from "../commands/query"
import {
  removeCommandSetting,
  updateCommandSettings,
  updateCommandUrlRules,
} from "../commands/settings"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { allowsKeybinding } from "../utils/commands"
import { validateUrlPattern } from "../utils/urlFilter"
import { showToast } from "./showToast"

const validateUrlRulesSetting = (urlRules: CommandUrlRulesSetting): void => {
  for (const [field, patterns] of Object.entries(urlRules)) {
    if (patterns === undefined) {
      continue
    }

    if (!Array.isArray(patterns)) {
      throw new Error(`${field} must be an array of URL patterns`)
    }

    for (const pattern of patterns) {
      const validation = validateUrlPattern(pattern)
      if (validation !== true) {
        throw new Error(`Invalid pattern "${pattern}": ${validation}`)
      }
    }
  }
}

export async function updateCommandSetting(
  message: UpdateCommandSettingMessage,
  sender?: any,
) {
  const { commandId, setting, value } = message
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )

  if (setting === "keybinding") {
    const settingValue = normalizeKeybinding(String(value ?? ""))

    if (!settingValue) {
      await removeCommandSetting(commandId, "keybinding")
      await refreshKeybindingRegistry()
      return { success: true }
    }

    const resolved = await resolveCommandById(commandId, message.context, {
      siteSdk,
    })

    if (!resolved || !allowsKeybinding(resolved.command)) {
      throw new Error(`Command cannot be assigned a keybinding: ${commandId}`)
    }

    await updateCommandSettings(commandId, {
      keybinding: settingValue,
    })
    await refreshKeybindingRegistry()

    // Show success toast for keybinding updates
    await showToast({
      type: "show-toast",
      level: "success",
      message: `Keybinding set to ${settingValue}`,
    })
  }

  if (setting === "urlRules") {
    validateUrlRulesSetting(value)
    await updateCommandUrlRules(commandId, value)
  }

  return { success: true }
}
