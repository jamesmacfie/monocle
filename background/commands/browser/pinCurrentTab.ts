import type { CommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage, updateTab } from "../../utils/browser"

export const pinCurrentTab: CommandNode = {
  type: "action",
  id: "pin-current-tab",
  name: "Pin current tab",
  icon: { type: "lucide", name: "Pin" },
  color: "green",
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { pinned: true })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "Tab pinned",
      })
    }
  },
}
