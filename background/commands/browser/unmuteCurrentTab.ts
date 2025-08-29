import type { RunCommand } from "../../../types"
import { updateTab } from "../../utils/browser"

export const unmuteCurrentTab: RunCommand = {
  id: "unmute-current-tab",
  name: "Unmute current tab",
  icon: { name: "Volume2" },
  color: "green",
  run: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { muted: false })
    }
  },
}
