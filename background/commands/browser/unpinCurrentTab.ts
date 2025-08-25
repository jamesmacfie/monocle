import type { RunCommand } from "../../../types";
import { queryTabs, updateTab } from "../../utils/browser";

export const unpinCurrentTab: RunCommand = {
  // TODO - should only show this if the current tab is actually pinned
  id: "unpin-current-tab",
  name: "Unpin current tab",
  icon: { name: 'PinOff' },
  color: "green",
  run: async () => {
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateTab(activeTab.id, { pinned: false });
    }
  },
}