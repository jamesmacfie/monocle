import type { CommandNode } from "../../../types/"
import { createWindow, queryTabs } from "../../utils/browser"

export const moveCurrentTabToANewWindow: CommandNode = {
  type: "action",
  id: "move-current-tab-to-a-new-window",
  name: "Move this tab to a new window",
  icon: { type: "lucide", name: "SquareArrowOutUpRight" },
  color: "yellow",
  permissions: ["tabs"],
  execute: async () => {
    const active_tabs = await queryTabs({
      currentWindow: true,
      active: true,
    })
    const active_tab = active_tabs[0]

    if (active_tab?.id) {
      // Check if active_tab and its id exist
      try {
        await createWindow({
          tabId: active_tab.id,
          focused: true,
        })
      } catch (error) {
        console.error("Error moving tab to new window:", error)
      }
    }
  },
}
