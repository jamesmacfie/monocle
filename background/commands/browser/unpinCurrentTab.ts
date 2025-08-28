import type { RunCommand } from "../../../types";
import { updateTab } from "../../utils/browser";

export const unpinCurrentTab: RunCommand = {
  // TODO - should only show this if the current tab is actually pinned
  id: "unpin-current-tab",
  name: "Unpin current tab",
  icon: { name: 'PinOff' },
  color: "green",
  run: async () => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { pinned: false });
    }
  },
}