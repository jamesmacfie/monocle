import type { ActionCommandNode } from "../../shared/types"
import { getActiveTab } from "../utils/browser"

export const clearRecentsCommand: ActionCommandNode = {
  type: "action",
  id: "clear-recents",
  name: "Clear recents",
  description: "Clear all recently selected commands",
  icon: { type: "lucide", name: "Trash2" },
  doNotAddToRecents: true,
  execute: async () => {
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
