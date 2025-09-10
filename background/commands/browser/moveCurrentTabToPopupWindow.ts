import type { RunCommand } from "../../../types/"
import { createWindow, queryTabs } from "../../utils/browser"

export const moveCurrentTabToPopupWindow: RunCommand = {
  id: "move-current-tab-to-popup-window",
  name: "Move current tab to popup window",
  icon: { type: "lucide", name: "Maximize2" },
  color: "yellow",
  permissions: ["tabs"],
  run: async () => {
    const active_tabs = await queryTabs({
      currentWindow: true,
      active: true,
    })
    const active_tab = active_tabs[0]

    if (active_tab?.id) {
      // Check if active_tab and its id exist
      try {
        await createWindow({
          // await the creation
          tabId: active_tab.id,
          type: "popup",
          //  focused: true // Optionally focus the new window
        })
      } catch (error) {
        console.error("Error moving tab to popup window:", error)
      }
    }
  },
}
