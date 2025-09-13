import type { CommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage, updateTab } from "../../utils/browser"

export const unpinCurrentTab: CommandNode = {
  type: "action",
  // TODO - should only show this if the current tab is actually pinned
  id: "unpin-current-tab",
  name: "Unpin current tab",
  icon: { type: "lucide", name: "PinOff" },
  color: "green",
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { pinned: false })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "Tab unpinned",
      })
    }
  },
}
