import type { CommandNode } from "../../../shared/types"
import { callBrowserAPI } from "../../utils/browser"

export const reloadCurrentTab: CommandNode = {
  type: "action",
  id: "reload-current-tab",
  name: "Reload current tab",
  icon: { type: "lucide", name: "RotateCw" },
  color: "green",
  keybinding: "⌘ r",
  execute: async () => {
    await callBrowserAPI("tabs", "reload")
  },
}
