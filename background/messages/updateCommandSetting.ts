import type { UpdateCommandSettingMessage } from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { resolveCommandById } from "../commands/query"
import { updateCommandSettings } from "../commands/settings"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { allowsKeybinding } from "../utils/commands"
import { showToast } from "./showToast"

export async function updateCommandSetting(
  message: UpdateCommandSettingMessage,
) {
  const { commandId, setting, value } = message
  let settingValue = value

  if (setting === "keybinding") {
    const resolved = await resolveCommandById(commandId, message.context)

    if (!resolved || !allowsKeybinding(resolved.command)) {
      throw new Error(`Command cannot be assigned a keybinding: ${commandId}`)
    }

    settingValue = normalizeKeybinding(String(value))

    if (!settingValue) {
      throw new Error("Invalid keybinding")
    }
  }

  // Update the command setting
  await updateCommandSettings(commandId, {
    [setting]: settingValue,
  })

  // Refresh keybinding registry if this was a keybinding update
  if (setting === "keybinding") {
    await refreshKeybindingRegistry()

    // Show success toast for keybinding updates
    await showToast({
      type: "show-toast",
      level: "success",
      message: `Keybinding set to ${settingValue}`,
    })
  }

  return { success: true }
}
