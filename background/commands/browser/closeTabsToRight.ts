import type { CommandNode } from "../../../types/"
import {
  getActiveTab,
  queryTabs,
  removeTab,
  sendTabMessage,
} from "../../utils/browser"

export const closeTabsToRight: CommandNode = {
  type: "action",
  id: "close-tabs-to-right",
  name: "Close tabs to the right",
  icon: { type: "lucide", name: "ChevronRight" },
  color: "red",
  permissions: ["tabs"],
  confirmAction: true,
  execute: async () => {
    const activeTab = await getActiveTab()

    if (!activeTab) {
      console.error("No active tab found")
      return
    }

    // Get all tabs in the current window
    const allTabs = await queryTabs({ currentWindow: true })

    // Close tabs with indices greater than the active tab in a single loop
    let closedCount = 0
    for (const tab of allTabs) {
      if (tab.index > activeTab.index && tab.id !== undefined) {
        await removeTab(tab.id)
        closedCount++
      }
    }

    if (closedCount > 0) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: `${closedCount} tab${closedCount === 1 ? "" : "s"} to the right closed`,
      })
    }
  },
}
