import type { UpdateCommandSettingMessage } from "../../shared/types"
import { updateCommandSettings } from "../commands/settings"
import { showToast } from "./showToast"

export async function updateCommandSetting(
  message: UpdateCommandSettingMessage,
) {
  const { commandId, setting, value } = message

  // Update the command setting
  await updateCommandSettings(commandId, {
    [setting]: value,
  })

  // Refresh keybinding registry if this was a keybinding update
  if (setting === "keybinding") {
    const { refreshKeybindingRegistry } = require("../keybindings/registry")
    await refreshKeybindingRegistry()

    // Show success toast for keybinding updates
    await showToast({
      type: "show-toast",
      level: "success",
      message: `Keybinding set to ${value}`,
    })
  }

  return { success: true }
}
