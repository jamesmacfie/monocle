import type { RunCommand } from "../../../types";
import { queryTabs, removeTab, updateTab } from "../../utils/browser";

export const closeOtherTabs: RunCommand = {
  id: "close-other-tabs",
  name: "Close other tabs",
  icon: { name: 'XOctagon' },
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

    // Close tabs that are not the active tab in a single loop
    for (const tab of allTabs) {
      if (tab.id !== activeTab.id && tab.id !== undefined) {
        await removeTab(tab.id);
      }
    }
  },
}