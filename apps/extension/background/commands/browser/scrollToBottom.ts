import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const scrollToBottom: ActionCommandNode = {
  type: "action",
  id: "scroll-to-bottom",
  name: "Scroll to bottom",
  description: "Scroll the current page to the bottom",
  icon: { type: "lucide", name: "ArrowDownToLine" },
  color: "blue",
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }
    await sendTabMessage(activeTab.id, {
      type: "monocle-scroll",
      direction: "bottom",
    })
  },
}
