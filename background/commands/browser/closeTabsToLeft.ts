import type { RunCommand } from "../../../types";
import { queryTabs, removeTab, updateTab } from "../../utils/browser";

export const closeTabsToLeft: RunCommand = {
  id: "close-tabs-to-left",
  name: "Close tabs to the left",
  icon: { name: "ChevronLeft" },
  color: "red",
  run: async () => {
    // Get the active tab directly
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });

    if (!activeTab?.id) {
      console.error("No active tab found");
      return;
    }

    // Get all tabs in the current window
    const allTabs = await queryTabs({ currentWindow: true });

    // Close tabs with indices less than the active tab in a single loop
    for (const tab of allTabs) {
      if (tab.index < activeTab.index && tab.id !== undefined) {
        await removeTab(tab.id);
      }
    }
  },
}