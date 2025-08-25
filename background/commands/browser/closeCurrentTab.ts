import type { Command } from "../../../types";
import { queryTabs, removeTab } from "../../utils/browser";

export const closeCurrentTab: Command = {
  id: "close-current-tab",
  name: "Close current tab",
  icon: { name: "X" },
  color: "red",
  keybinding: "⌃ d",
  run: async () => {
    const tabs = await queryTabs({
      active: true,
      currentWindow: true,
    });
    // Assuming only one active tab per window
    if (tabs.length > 0 && tabs[0].id !== undefined) {
      await removeTab(tabs[0].id);
    }
  },
}