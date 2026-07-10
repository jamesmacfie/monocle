// Architecture: background settings message boundary. UI settings mutations
// are partial patches; this handler routes them through the serialized writers
// that own `monocle-settings`, then returns the fresh mirror values.
import type { UpdateSettingsMessage } from "../../shared/types"
import {
  getNewTabSettings,
  getThemeSettings,
  updateNewTabSettings,
  updateThemeSettings,
} from "../commands/settings"
import { createMessageHandler } from "../utils/messages"

const handleUpdateSettings = async (message: UpdateSettingsMessage) => {
  if (message.theme) {
    await updateThemeSettings(message.theme)
  }
  if (message.newTab) {
    await updateNewTabSettings(message.newTab)
  }

  const [theme, newTab] = await Promise.all([
    getThemeSettings(),
    getNewTabSettings(),
  ])
  return { success: true as const, theme, newTab }
}

export const updateSettings = createMessageHandler(
  handleUpdateSettings,
  "Failed to update settings",
)
