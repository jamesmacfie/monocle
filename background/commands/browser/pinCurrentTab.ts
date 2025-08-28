import type { RunCommand } from "../../../types";
import { getActiveTab, updateTab } from "../../utils/browser";

export const pinCurrentTab: RunCommand = {
  id: "pin-current-tab",
  name: "Pin current tab",
  icon: { name: 'Pin' },
  color: "green",
  run: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { pinned: true });
    }
  },
}