import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  queryTabs,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"

export const moveTabLeft: ActionCommandNode = {
  type: "action",
  id: "move-tab-left",
  name: "Move tab left",
  description: "Move the current tab one position to the left",
  icon: { type: "lucide", name: "ArrowLeft" },
  color: "blue",
  keywords: ["move", "tab", "left", "shift", "reorder"],
  actionLabel: "Move left",

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

      if (activeTab.index === 0) {
        // If at the beginning, wrap around to the end
        newIndex = tabCount - 1
      } else {
        // Move one position to the left
        newIndex = activeTab.index - 1
      }

      // Move the tab to the new position
      await callBrowserAPI("tabs", "move", activeTab.id, { index: newIndex })

      // Show success message
      if (activeTab.index === 0) {
        await sendSuccessToastToActiveTab("Tab moved to end")
      } else {
        await sendSuccessToastToActiveTab("Tab moved left")
      }
    } catch (error) {
      console.error("Failed to move tab left:", error)
      await sendErrorToastToActiveTab("Failed to move tab")
    }
  },
}
