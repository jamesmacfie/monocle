import type { RunCommand } from "../../../types";
import { queryTabs, updateTab } from "../../utils/browser";

export const pinCurrentTab: RunCommand = {
  id: "pin-current-tab",
  name: "Pin current tab",
  icon: { name: 'Pin' },
  color: "green",
  run: async () => {
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateTab(activeTab.id, { pinned: true });
    }
  },
}