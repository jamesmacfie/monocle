import type { CommandNode } from "../../../shared/types"
import {
  getRecentlyClosed,
  restoreSession,
  sendToastToActiveTab,
} from "../../utils/browser"

export const reopenLastClosedTab: CommandNode = {
  type: "action",
  id: "reopen-last-closed-tab",
  name: "Reopen Last Closed Tab",
  description: "Restore the most recently closed tab",
  icon: { type: "lucide", name: "RotateCcw" },
  color: "blue",
  keywords: ["reopen", "restore", "closed", "tab", "undo", "last", "recent"],
  actionLabel: "Reopen",
  permissions: ["sessions"],
  // Reopens a tab the user wants to see — raise the browser after running.
  external: { focusBrowser: true },
  execute: async () => {
    try {
      const recentlyClosed = await getRecentlyClosed()

      if (!recentlyClosed || recentlyClosed.length === 0) {
        await sendToastToActiveTab("info", "No recently closed tabs to restore")
        return
      }

      // Find the most recent tab (not window)
      const lastClosedTab = recentlyClosed.find((session) => session.tab)

      if (!lastClosedTab) {
        await sendToastToActiveTab(
          "info",
          "No recently closed tabs to restore (only windows available)",
        )
        return
      }

      // Restore the session
      await restoreSession(lastClosedTab.tab?.sessionId)

      const tabTitle = lastClosedTab.tab?.title || "Tab"
      await sendToastToActiveTab("success", `Reopened: ${tabTitle}`)
    } catch (error) {
      console.error("Failed to reopen last closed tab:", error)

      await sendToastToActiveTab("error", "Failed to reopen last closed tab")
    }
  },
}
