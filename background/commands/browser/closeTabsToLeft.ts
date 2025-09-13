import type { CommandNode } from "../../../shared/types"
import {
  getActiveTab,
  queryTabs,
  removeTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"

export const closeTabsToLeft: CommandNode = {
  type: "action",
  id: "close-tabs-to-left",
  name: "Close tabs to the left",
  icon: { type: "lucide", name: "ChevronLeft" },
  color: "red",
  permissions: ["tabs"],
  confirmAction: true,
  execute: async () => {
    const activeTab = await getActiveTab()

    if (!activeTab) {
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
      await sendSuccessToastToActiveTab(
        `${closedCount} tab${closedCount === 1 ? "" : "s"} to the left closed`,
      )
    }
  },
}
