import type { RunCommand } from "../../../types/"
import { getActiveTab, queryTabs, removeTab } from "../../utils/browser"

export const closeTabsToRight: RunCommand = {
  id: "close-tabs-to-right",
  name: "Close tabs to the right",
  icon: { type: "lucide", name: "ChevronRight" },
  color: "red",
  run: async () => {
    const activeTab = await getActiveTab()

    if (!activeTab) {
      console.error("No active tab found")
      return
    }

    // Get all tabs in the current window
    const allTabs = await queryTabs({ currentWindow: true })

    // Close tabs with indices greater than the active tab in a single loop
    for (const tab of allTabs) {
      if (tab.index > activeTab.index && tab.id !== undefined) {
        await removeTab(tab.id)
      }
    }
  },
}
