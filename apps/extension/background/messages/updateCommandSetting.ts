import type {
  CommandUrlRulesSetting,
  UpdateCommandSettingMessage,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { validateKeybindingRequirements } from "../../shared/utils/keybinding-requirements"
import {
  clearCommandKeybindingAndRefresh,
  setCommandHiddenAndInvalidate,
  setCommandKeybindingAndRefresh,
  updateCommandUrlRulesAndInvalidate,
} from "../commands/settingMutations"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { resolveKeybindingAssignmentTarget } from "../keybindings/assignmentTarget"
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
      await clearCommandKeybindingAndRefresh(commandId)
      return { success: true }
    }

    const target = await resolveKeybindingAssignmentTarget({
      commandId,
      context: message.context,
      options: { siteSdk },
    })
    if (!target.allowed) {
      throw new Error(`Command cannot be assigned a keybinding: ${commandId}`)
    }

    // Per-command requirement gate (e.g. snippet bindings must carry a
    // non-shift modifier in every stroke). The capture UIs block earlier via
    // check-keybinding-conflict; this is the backstop on persist.
    const requirementResult = validateKeybindingRequirements(
      settingValue,
      target.requirements,
    )
    if (!requirementResult.valid) {
      throw new Error(
        `Keybinding not allowed for ${commandId}: ${requirementResult.message}`,
      )
    }

    await setCommandKeybindingAndRefresh(commandId, settingValue)

    // Show success toast for keybinding updates
    await showToast({
      type: "show-toast",
      level: "success",
      message: `Keybinding set to ${settingValue}`,
    })
  }

  if (setting === "urlRules") {
    validateUrlRulesSetting(value)
    await updateCommandUrlRulesAndInvalidate(commandId, value)
  }

  if (setting === "hidden") {
    await setCommandHiddenAndInvalidate(commandId, value)
  }

  return { success: true }
}
