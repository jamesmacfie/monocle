import type { CommandNode } from "../../../../shared/types"
import { getActiveTab, sendToastToActiveTab } from "../../../utils/browser"
import { toggleReaderMode as toggleReaderModeAPI } from "../../../utils/firefox"

export const toggleReaderMode: CommandNode = {
  type: "action",
  id: "toggle-reader-mode",
  name: "Toggle Reader Mode",
  description: "Toggle Firefox Reader Mode for the current tab",
  icon: { type: "lucide", name: "BookOpen" },
  color: "green",
  keywords: ["reader", "mode", "reading", "firefox", "simplify", "article"],
  supportedBrowsers: ["firefox"],
  actionLabel: "Toggle Reader Mode",
  keybinding: "<alt-cmd-R>",
  execute: async () => {
    const activeTab = await getActiveTab()

    if (!activeTab?.id) {
      return
    }

    try {
      await toggleReaderModeAPI(activeTab.id)

      await sendToastToActiveTab("success", "Toggled Reader Mode")
    } catch (error) {
      console.error("Failed to toggle reader mode:", error)

      await sendToastToActiveTab(
        "error",
        "Reader Mode not available for this page",
      )
    }
  },
}
