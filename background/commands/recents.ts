import type { Command } from "../../types"
import { getActiveTab } from "../utils/browser"

export const clearRecentsCommand: Command = {
  id: "clear-recents",
  name: "Clear recents",
  description: "Clear all recently selected commands",
  icon: { name: "Trash2" },
  doNotAddToRecents: true,
  run: async () => {
    try {
      await browser.storage.local.remove("monocle-commandUsage")

      // Send success notification
      const activeTab = await getActiveTab()
      if (activeTab) {
        browser.tabs.sendMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success",
          message: "Recent commands cleared successfully",
        })
      }
    } catch (error) {
      console.error("Failed to clear recent commands:", error)

      // Send error notification
      const activeTab = await getActiveTab()
      if (activeTab) {
        browser.tabs.sendMessage(activeTab.id, {
          type: "monocle-alert",
          level: "error",
          message: "Failed to clear recent commands",
        })
      }
    }
  },
}
