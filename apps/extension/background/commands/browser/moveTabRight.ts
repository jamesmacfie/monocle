import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  queryTabs,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"

export const moveTabRight: ActionCommandNode = {
  type: "action",
  id: "move-tab-right",
  name: "Move tab right",
  description: "Move the current tab one position to the right",
  icon: { type: "lucide", name: "ArrowRight" },
  color: "blue",
  keywords: ["move", "tab", "right", "shift", "reorder"],
  actionLabel: "Move right",
  execute: async () => {
    try {
      const tabs = await queryTabs({ active: true, currentWindow: true })
      const activeTab = tabs[0]

      if (!activeTab?.id || activeTab.index === undefined) {
        throw new Error("No active tab found")
      }

      // Get all tabs in the current window to determine the total count
      const allTabs = await queryTabs({ currentWindow: true })
      const tabCount = allTabs.length

      let newIndex: number

      if (activeTab.index === tabCount - 1) {
        // If at the end, wrap around to the beginning
        newIndex = 0
      } else {
        // Move one position to the right
        newIndex = activeTab.index + 1
      }

      // Move the tab to the new position
      await callBrowserAPI("tabs", "move", activeTab.id, { index: newIndex })

      // Show success message
      if (activeTab.index === tabCount - 1) {
        await sendSuccessToastToActiveTab("Tab moved to beginning")
      } else {
        await sendSuccessToastToActiveTab("Tab moved right")
      }
    } catch (error) {
      console.error("Failed to move tab right:", error)
      await sendErrorToastToActiveTab("Failed to move tab")
    }
  },
}
