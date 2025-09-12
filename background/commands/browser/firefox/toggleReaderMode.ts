import type { CommandNode } from "../../../../types/"
import { getActiveTab, sendTabMessage } from "../../../utils/browser"
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
  keybinding: "⌥ ⌘ R",
  execute: async () => {
    const activeTab = await getActiveTab()

    if (!activeTab?.id) {
      return
    }

    try {
      await toggleReaderModeAPI(activeTab.id)

      await sendTabMessage(activeTab.id, {
        type: "monocle-alert",
        level: "success",
        message: "Toggled Reader Mode",
        icon: { name: "BookOpen" },
      })
    } catch (error) {
      console.error("Failed to toggle reader mode:", error)

      await sendTabMessage(activeTab.id, {
        type: "monocle-alert",
        level: "error",
        message: "Reader Mode not available for this page",
        icon: { name: "AlertTriangle" },
      })
    }
  },
}
