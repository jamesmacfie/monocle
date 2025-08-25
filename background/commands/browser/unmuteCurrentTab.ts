import type { RunCommand } from "../../../types";
import { queryTabs, updateTab } from "../../utils/browser";

export const unmuteCurrentTab: RunCommand = {
  id: "unmute-current-tab",
  name: "Unmute current tab",
  icon: { name: 'Volume2' },
  color: "green",
  run: async () => {
    // Get the active tab and update it
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateTab(activeTab.id, { muted: false });
    }
  },
}