import type { CommandNode } from "../../../shared/types"
import { createWindow } from "../../utils/browser"

export const openNewWindow: CommandNode = {
  type: "action",
  id: "open-new-window",
  name: "Open new window",
  icon: { type: "lucide", name: "AppWindow" },
  color: "purple",
  keybinding: "⌘ n",
  execute: () => {
    createWindow({})
  },
}
