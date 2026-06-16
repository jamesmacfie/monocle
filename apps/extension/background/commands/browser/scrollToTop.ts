import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const scrollToTop: ActionCommandNode = {
  type: "action",
  id: "scroll-to-top",
  name: "Scroll to top",
  description: "Scroll the current page to the top",
  icon: { type: "lucide", name: "ArrowUpToLine" },
  color: "blue",
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }
    await sendTabMessage(activeTab.id, {
      type: "monocle-scroll",
      direction: "top",
    })
  },
}
