import type { RunCommand } from "../../../types";
import { queryTabs, updateTab } from "../../utils/browser";

export const muteCurrentTab: RunCommand = {
  id: "mute-current-tab",
  name: "Mute current tab",
  icon: { name: 'VolumeX' },
  color: "red",
  run: async () => {
    // Get the active tab and update it
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateTab(activeTab.id, { muted: true });
    }
  },
}