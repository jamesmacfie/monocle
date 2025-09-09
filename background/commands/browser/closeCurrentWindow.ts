import type { RunCommand } from "../../../types/"
import { getCurrentWindow, removeWindow } from "../../utils/browser"

export const closeCurrentWindow: RunCommand = {
  id: "close-current-window",
  name: "Close current window",
  icon: { type: "lucide", name: "XOctagon" },
  color: "red",
  keybinding: "⌘ ⇧ w",
  confirmAction: true,
  run: async () => {
    const current_window = await getCurrentWindow()
    if (current_window.id) {
      await removeWindow(current_window.id)
    }
  },
}
