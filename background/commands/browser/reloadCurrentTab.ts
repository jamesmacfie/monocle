import type { CommandNode } from "../../../shared/types"
import { callBrowserAPI, getActiveTab } from "../../utils/browser"

export const reloadCurrentTab: CommandNode = {
  type: "action",
  id: "reload-current-tab",
  name: "Reload current tab",
  icon: { type: "lucide", name: "RotateCw" },
  color: "green",
  keybinding: "<cmd-r>",
  actionLabel: "Reload",
  modifierActionLabel: {
    cmd: "Hard reload (bypass cache)",
  },
  execute: async (context) => {
    if (context?.modifierKey === "cmd") {
      // Hard reload: bypass the cache. Pass the tab id explicitly so the
      // reloadProperties object is interpreted correctly in both Chrome and
      // Firefox.
      const activeTab = await getActiveTab()
      if (activeTab?.id) {
        await callBrowserAPI("tabs", "reload", activeTab.id, {
          bypassCache: true,
        })
      }
    } else {
      await callBrowserAPI("tabs", "reload")
    }
  },
}
