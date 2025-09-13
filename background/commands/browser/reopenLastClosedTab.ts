import type { CommandNode } from "../../../shared/types"
import {
  getActiveTab,
  getRecentlyClosed,
  restoreSession,
  sendTabMessage,
} from "../../utils/browser"

export const reopenLastClosedTab: CommandNode = {
  type: "action",
  id: "reopen-last-closed-tab",
  name: "Reopen Last Closed Tab",
  description: "Restore the most recently closed tab",
  icon: { type: "lucide", name: "RotateCcw" },
  color: "blue",
  keywords: ["reopen", "restore", "closed", "tab", "undo", "last", "recent"],
  keybinding: "⌘ ⇧ T",
  actionLabel: "Reopen",
  permissions: ["sessions"],
  execute: async () => {
    const activeTab = await getActiveTab()

    try {
      const recentlyClosed = await getRecentlyClosed()

      if (!recentlyClosed || recentlyClosed.length === 0) {
        if (activeTab) {
          await sendTabMessage(activeTab.id, {
            type: "monocle-alert",
            level: "info",
            message: "No recently closed tabs to restore",
            icon: { name: "Info" },
          })
        }
        return
      }

      // Find the most recent tab (not window)
      const lastClosedTab = recentlyClosed.find((session) => session.tab)

      if (!lastClosedTab) {
        if (activeTab) {
          await sendTabMessage(activeTab.id, {
            type: "monocle-alert",
            level: "info",
            message:
              "No recently closed tabs to restore (only windows available)",
            icon: { name: "Info" },
          })
        }
        return
      }

      // Restore the session
      await restoreSession(lastClosedTab.tab?.sessionId)

      if (activeTab) {
        const tabTitle = lastClosedTab.tab?.title || "Tab"
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success",
          message: `Reopened: ${tabTitle}`,
          icon: { name: "RotateCcw" },
        })
      }
    } catch (error) {
      console.error("Failed to reopen last closed tab:", error)

      if (activeTab) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "error",
          message: "Failed to reopen last closed tab",
          icon: { name: "AlertTriangle" },
        })
      }
    }
  },
}
