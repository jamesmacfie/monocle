import type { CommandNode } from "../../../shared/types"
import { getCurrentWindow, removeWindow } from "../../utils/browser"

export const closeCurrentWindow: CommandNode = {
  type: "action",
  id: "close-current-window",
  name: "Close current window",
  icon: { type: "lucide", name: "XOctagon" },
  color: "red",
  keybinding: "⌘ ⇧ w",
  confirmAction: true,
  execute: async () => {
    const current_window = await getCurrentWindow()
    if (current_window.id) {
      await removeWindow(current_window.id)
    }
  },
}
