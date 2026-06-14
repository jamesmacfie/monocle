import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  getActiveTab,
  sendToastToActiveTab,
} from "../../utils/browser"

async function canGoBack(): Promise<boolean> {
  try {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return false
    }

    // Chrome doesn't have a direct API to check navigation state
    // We'll assume back is available unless we're on a new tab page
    const isNewTab =
      activeTab.url === "chrome://newtab/" ||
      activeTab.url === "about:newtab" ||
      activeTab.url === "moz-extension://" ||
      activeTab.url?.startsWith("chrome-extension://")

    return !isNewTab
  } catch (_error) {
    return false
  }
}

async function goBack(tabId: number): Promise<void> {
  return callBrowserAPI("tabs", "goBack", tabId)
}

export const goBackCommand: ActionCommandNode = {
  type: "action",
  id: "go-back",
  name: async () => {
    const canNavigateBack = await canGoBack()
    return canNavigateBack ? "Go Back" : "No Back History"
  },
  description: "Navigate to the previous page in history",
  icon: { type: "lucide", name: "ArrowLeft" },
  color: "blue",
  keywords: ["back", "navigate", "history", "previous", "page"],
  keybinding: "<alt-left>",

  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    const canNavigateBack = await canGoBack()
    if (!canNavigateBack) {
      await sendToastToActiveTab("info", "No previous page in history")
      return
    }

    try {
      await goBack(activeTab.id)

      await sendToastToActiveTab("success", "Navigated back")
    } catch (error) {
      console.error("Failed to go back:", error)

      await sendToastToActiveTab("error", "Failed to navigate back")
    }
  },
}
