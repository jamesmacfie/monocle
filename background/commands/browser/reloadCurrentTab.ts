import type { RunCommand } from "../../../types/"
import { callBrowserAPI } from "../../utils/browser"

export const reloadCurrentTab: RunCommand = {
  id: "reload-current-tab",
  name: "Reload current tab",
  icon: { name: "RotateCw" },
  color: "green",
  run: () => {
    return callBrowserAPI("tabs", "reload")
  },
}
