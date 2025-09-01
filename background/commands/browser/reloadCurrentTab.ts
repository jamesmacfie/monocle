import type { RunCommand } from "../../../types/"
import { callBrowserAPI } from "../../utils/browser"

export const reloadCurrentTab: RunCommand = {
  id: "reload-current-tab",
  name: "Reload current tab",
  icon: { type: "lucide", name: "RotateCw" },
  color: "green",
  keybinding: "⌘ r",
  run: () => {
    return callBrowserAPI("tabs", "reload")
  },
}
