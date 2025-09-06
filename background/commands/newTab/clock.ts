import type { ParentCommand, RunCommand } from "../../../types"
import { getNewTabClockSettings, updateNewTabClockSettings } from "../settings"

const toggleClockVisibility: RunCommand = {
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
  run: async () => {
    console.debug("[ClockCommand] Toggling clock visibility")
    const currentSettings = await getNewTabClockSettings()
    const isCurrentlyVisible = currentSettings.show ?? true // Default to true if undefined
    await updateNewTabClockSettings({
      show: !isCurrentlyVisible,
    })
  },
  doNotAddToRecents: false,
}

export const clockCommand: ParentCommand = {
  id: "new-tab-clock",
  name: "Clock",
  description: "Clock settings for new tab page",
  icon: { type: "lucide", name: "Clock" },
  color: "blue",
  keywords: ["clock", "time", "new tab"],
  commands: async (context) => {
    console.debug("[ClockCommand] Getting children, context:", context)
    const children = [toggleClockVisibility]
    console.debug(
      "[ClockCommand] Returning children:",
      children.map((c) => c.id),
    )
    return children
  },
  supportedBrowsers: ["chrome", "firefox"],
}
