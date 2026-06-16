import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage, updateTab } from "../../utils/browser"

export const togglePinCurrentTab: ActionCommandNode = {
  type: "action",
  id: "toggle-pin-current-tab",
  name: async () => {
    const activeTab = await getActiveTab()
    return activeTab?.pinned ? "Unpin current tab" : "Pin current tab"
  },
  icon: async () => {
    const activeTab = await getActiveTab()
    return activeTab?.pinned
      ? { type: "lucide", name: "PinOff" }
      : { type: "lucide", name: "Pin" }
  },
  color: "green",
  keywords: ["pin", "unpin", "pinned"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      const nextPinned = !activeTab.pinned
      await updateTab(activeTab.id, { pinned: nextPinned })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: nextPinned ? "Tab pinned" : "Tab unpinned",
      })
    }
  },
}
