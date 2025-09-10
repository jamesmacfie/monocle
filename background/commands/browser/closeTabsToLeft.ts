import type { RunCommand } from "../../../types/"
import {
  getActiveTab,
  queryTabs,
  removeTab,
  sendTabMessage,
} from "../../utils/browser"

export const closeTabsToLeft: RunCommand = {
  id: "close-tabs-to-left",
  name: "Close tabs to the left",
  icon: { type: "lucide", name: "ChevronLeft" },
  color: "red",
  permissions: ["tabs"],
  confirmAction: true,
  run: async () => {
    const activeTab = await getActiveTab()

    if (!activeTab) {
      console.error("No active tab found")
      return
    }

    // Get all tabs in the current window
    const allTabs = await queryTabs({ currentWindow: true })

    // Close tabs with indices less than the active tab in a single loop
    let closedCount = 0
    for (const tab of allTabs) {
      if (tab.index < activeTab.index && tab.id !== undefined) {
        await removeTab(tab.id)
        closedCount++
      }
    }

    if (closedCount > 0) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: `${closedCount} tab${closedCount === 1 ? "" : "s"} to the left closed`,
      })
    }
  },
}
