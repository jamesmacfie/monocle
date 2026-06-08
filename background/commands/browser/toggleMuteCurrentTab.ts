import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage, updateTab } from "../../utils/browser"

export const toggleMuteCurrentTab: ActionCommandNode = {
  type: "action",
  id: "toggle-mute-current-tab",
  // Mute state is read from `mutedInfo.muted` (browser API shape) but set via
  // `updateTab({ muted })`.
  name: async () => {
    const activeTab = await getActiveTab()
    return activeTab?.mutedInfo?.muted
      ? "Unmute current tab"
      : "Mute current tab"
  },
  icon: async () => {
    const activeTab = await getActiveTab()
    return activeTab?.mutedInfo?.muted
      ? { type: "lucide", name: "Volume2" }
      : { type: "lucide", name: "VolumeX" }
  },
  color: "blue",
  keywords: ["mute", "unmute", "muted", "audio", "sound"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      const nextMuted = !activeTab.mutedInfo?.muted
      await updateTab(activeTab.id, { muted: nextMuted })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: nextMuted ? "Tab muted" : "Tab unmuted",
      })
    }
  },
}
