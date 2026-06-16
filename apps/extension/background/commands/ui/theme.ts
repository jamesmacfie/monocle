import type { ActionCommandNode } from "../../../shared/types"
import { getThemeSettings, updateThemeSettings } from "../settings"

export const toggleTheme: ActionCommandNode = {
  type: "action",
  id: "toggle-theme",
  name: async () => {
    const settings = await getThemeSettings()
    const currentMode = settings.mode ?? "system"

    switch (currentMode) {
      case "light":
        return "Switch to Dark Theme"
      case "dark":
        return "Switch to System Theme"
      default:
        return "Switch to Light Theme"
    }
  },
  description: async () => {
    const settings = await getThemeSettings()
    const currentMode = settings.mode ?? "system"

    switch (currentMode) {
      case "light":
        return "Currently light theme - switch to dark"
      case "dark":
        return "Currently dark theme - switch to system"
      default:
        return "Currently system theme - switch to light"
    }
  },
  icon: async () => {
    const settings = await getThemeSettings()
    const currentMode = settings.mode ?? "system"

    switch (currentMode) {
      case "light":
        return { type: "lucide", name: "Sun" }
      case "dark":
        return { type: "lucide", name: "Moon" }
      default:
        return { type: "lucide", name: "Monitor" }
    }
  },
  color: "purple",
  keywords: ["theme", "dark", "light", "system", "appearance", "mode"],
  execute: async () => {
    const currentSettings = await getThemeSettings()
    const currentMode = currentSettings.mode ?? "system"

    // Cycle through: system -> light -> dark -> system
    let nextMode: "light" | "dark" | "system"
    switch (currentMode) {
      case "system":
        nextMode = "light"
        break
      case "light":
        nextMode = "dark"
        break
      default:
        nextMode = "system"
        break
    }

    await updateThemeSettings({
      mode: nextMode,
    })
  },
  supportedBrowsers: ["chrome", "firefox"],
}
