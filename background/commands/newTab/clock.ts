import type { CommandNode } from "../../../shared/types"
import { getNewTabClockSettings, updateNewTabClockSettings } from "../settings"

const toggleClockVisibility: CommandNode = {
  type: "action",
  id: "toggle-clock-visibility",
  name: async () => {
    const settings = await getNewTabClockSettings()
    const isCurrentlyVisible = settings.show ?? true // Default to true if undefined
    return isCurrentlyVisible ? "Hide Clock" : "Show Clock"
  },
  description: async () => {
    const settings = await getNewTabClockSettings()
    const isCurrentlyVisible = settings.show ?? true // Default to true if undefined
    return isCurrentlyVisible
      ? "Hide the clock on new tab page"
      : "Show the clock on new tab page"
  },
  icon: { type: "lucide", name: "Clock" },
  color: "blue",
  // Keep the palette open after toggling so the state-aware label flips in
  // place ("Hide Clock" -> "Show Clock"). selectCommand re-resolves the page.
  remainOpenOnSelect: true,
  execute: async () => {
    const currentSettings = await getNewTabClockSettings()
    const isCurrentlyVisible = currentSettings.show ?? true // Default to true if undefined
    await updateNewTabClockSettings({
      show: !isCurrentlyVisible,
    })
  },
}

export const clockCommand: CommandNode = {
  type: "group",
  id: "new-tab-clock",
  name: "Clock",
  description: "Clock settings for new tab page",
  icon: { type: "lucide", name: "Clock" },
  color: "blue",
  keywords: ["clock", "time", "new tab"],
  settingsCatalog: {
    includeChildren: true,
  },
  children: async () => {
    const children = [toggleClockVisibility]
    return children
  },
  supportedBrowsers: ["chrome", "firefox"],
}
