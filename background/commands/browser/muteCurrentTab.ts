import type { RunCommand } from "../../../types"
import { getActiveTab, updateTab } from "../../utils/browser"

export const muteCurrentTab: RunCommand = {
  id: "mute-current-tab",
  name: "Mute current tab",
  icon: { name: "VolumeX" },
  color: "red",
  run: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { muted: true })
    }
  },
}
