import type { CommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage, updateTab } from "../../utils/browser"

export const unmuteCurrentTab: CommandNode = {
  type: "action",
  id: "unmute-current-tab",
  name: "Unmute current tab",
  icon: { type: "lucide", name: "Volume2" },
  color: "green",
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { muted: false })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "Tab unmuted",
      })
    }
  },
}
