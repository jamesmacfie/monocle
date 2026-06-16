import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  queryTabs,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"

export const sortTabsByTitle: ActionCommandNode = {
  type: "action",
  id: "sort-tabs-by-title",
  name: "Sort tabs by title",
  description: "Reorder the current window tabs alphabetically by title",
  icon: { type: "lucide", name: "ArrowDownAZ" },
  color: "blue",
  keywords: ["sort", "tabs", "title", "alphabetical", "order", "reorder"],
  execute: async () => {
    try {
      const tabs = await queryTabs({ currentWindow: true })
      const pinnedCount = tabs.filter((tab) => tab.pinned).length
      const sortedTabs = tabs
        .filter((tab) => !tab.pinned)
        .sort((left, right) =>
          (left.title ?? "").localeCompare(right.title ?? "", undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        )

      // Pinned tabs always occupy the lowest indices, so sorted unpinned
      // tabs slot in immediately after them
      for (const [offset, tab] of sortedTabs.entries()) {
        if (tab.id !== undefined) {
          await callBrowserAPI("tabs", "move", tab.id, {
            index: pinnedCount + offset,
          })
        }
      }

      await sendSuccessToastToActiveTab("Tabs sorted by title")
    } catch (error) {
      console.error("Failed to sort tabs by title:", error)
      await sendErrorToastToActiveTab("Failed to sort tabs")
    }
  },
}
