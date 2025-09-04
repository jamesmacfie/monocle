import type { RunCommand } from "../../../types/"
import {
  callBrowserAPI,
  getActiveTab,
  sendTabMessage,
} from "../../utils/browser"

export const reloadCurrentTab: RunCommand = {
  id: "reload-current-tab",
  name: "Reload current tab",
  icon: { type: "lucide", name: "RotateCw" },
  color: "green",
  keybinding: "⌘ r",
  run: async () => {
    await callBrowserAPI("tabs", "reload")
    const activeTab = await getActiveTab()
    if (activeTab) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "Tab reloaded",
      })
    }
  },
}
