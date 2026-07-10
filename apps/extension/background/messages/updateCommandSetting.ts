import type { UpdateCommandSettingMessage } from "../../shared/types"
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
import { validateUrlRulesValue } from "../utils/urlFilter"
import { showToast } from "./showToast"

export async function updateCommandSetting(
  message: UpdateCommandSettingMessage,
  sender?: any,
) {
  const { id: commandId, setting, value } = message
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
      type: "monocle-toast-show",
      level: "success",
      message: `Keybinding set to ${settingValue}`,
    })
  }

  if (setting === "urlRules") {
    const validation = validateUrlRulesValue(value)
    if (!validation.valid) {
      throw new Error(validation.error)
    }
    await updateCommandUrlRulesAndInvalidate(commandId, value)
  }

  if (setting === "hidden") {
    await setCommandHiddenAndInvalidate(commandId, value)
  }

  return { success: true }
}
