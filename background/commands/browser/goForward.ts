import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  getActiveTab,
  sendToastToActiveTab,
} from "../../utils/browser"

async function canGoForward(): Promise<boolean> {
  try {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) return false

    // Chrome doesn't have a direct API to check navigation state
    // We'll assume forward is available unless we're on a new tab page or error page
    const isNewTab =
      activeTab.url === "chrome://newtab/" ||
      activeTab.url === "about:newtab" ||
      activeTab.url === "moz-extension://" ||
      activeTab.url?.startsWith("chrome-extension://") ||
      activeTab.url?.startsWith("chrome://") ||
      activeTab.url?.startsWith("about:")

    return !isNewTab
  } catch (_error) {
    return false
  }
}

async function goForward(tabId: number): Promise<void> {
  return callBrowserAPI("tabs", "goForward", tabId)
}

export const goForwardCommand: ActionCommandNode = {
  type: "action",
  id: "go-forward",
  name: async () => {
    const canNavigateForward = await canGoForward()
    return canNavigateForward ? "Go Forward" : "No Forward History"
  },
  description: "Navigate to the next page in history",
  icon: { type: "lucide", name: "ArrowRight" },
  color: "blue",
  keywords: ["forward", "navigate", "history", "next", "page"],
  keybinding: "<alt-right>",

  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    const canNavigateForward = await canGoForward()
    if (!canNavigateForward) {
      await sendToastToActiveTab("info", "No next page in history")
      return
    }

    try {
      await goForward(activeTab.id)

      await sendToastToActiveTab("success", "Navigated forward")
    } catch (error) {
      console.error("Failed to go forward:", error)

      await sendToastToActiveTab("error", "Failed to navigate forward")
    }
  },
}
