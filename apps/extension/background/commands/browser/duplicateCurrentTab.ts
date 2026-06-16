import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  queryTabs,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"

export const duplicateCurrentTab: ActionCommandNode = {
  type: "action",
  id: "duplicate-current-tab",
  name: "Duplicate current tab",
  description: "Create a duplicate of the current tab",
  icon: { type: "lucide", name: "CopyPlus" },
  color: "purple",
  keywords: ["duplicate", "copy", "tab", "clone"],
  actionLabel: "Duplicate",
  modifierActionLabel: {
    shift: "Duplicate to left",
    cmd: "Duplicate in background",
  },
  execute: async (context) => {
    try {
      const tabs = await queryTabs({ active: true, currentWindow: true })
      const activeTab = tabs[0]

      if (!activeTab?.id) {
        throw new Error("No active tab found")
      }

      // Try to use native duplicate API first (preserves tab history)
      try {
        const duplicatedTab = await callBrowserAPI(
          "tabs",
          "duplicate",
          activeTab.id,
        )

        // Handle modifier keys
        if (context?.modifierKey === "shift") {
          // Move duplicated tab to the left (index 0)
          await callBrowserAPI("tabs", "move", duplicatedTab.id, { index: 0 })
        } else if (context?.modifierKey === "cmd") {
          // Keep the original tab active (duplicate in background)
          await callBrowserAPI("tabs", "update", activeTab.id, { active: true })
        }

        await sendSuccessToastToActiveTab("Tab duplicated successfully")
      } catch (duplicateError) {
        // Fallback: Create new tab with same URL if duplicate API is not available
        console.warn(
          "Native duplicate API not available, using fallback:",
          duplicateError,
        )

        const createProperties: any = {
          url: activeTab.url,
          active: context?.modifierKey !== "cmd", // Stay on current tab if cmd is held
        }

        // Handle position based on modifier
        if (context?.modifierKey === "shift") {
          createProperties.index = 0
        } else if (activeTab.index !== undefined) {
          // Place new tab right after the current one
          createProperties.index = activeTab.index + 1
        }

        await callBrowserAPI("tabs", "create", createProperties)
        await sendSuccessToastToActiveTab("Tab duplicated successfully")
      }
    } catch (error) {
      console.error("Failed to duplicate tab:", error)
      await sendErrorToastToActiveTab("Failed to duplicate tab")
    }
  },
}
