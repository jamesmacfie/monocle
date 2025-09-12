import type { CommandNode } from "../../../types/"
import { getActiveTab, sendTabMessage, updateTab } from "../../utils/browser"

export const muteCurrentTab: CommandNode = {
  type: "action",
  id: "mute-current-tab",
  name: "Mute current tab",
  icon: { type: "lucide", name: "VolumeX" },
  color: "red",
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { muted: true })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "Tab muted",
      })
    }
  },
}
