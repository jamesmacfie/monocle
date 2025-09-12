import type { CommandNode } from "../../../types/"
import { createWindow } from "../../utils/browser"

export const openNewPrivateWindow: CommandNode = {
  type: "action",
  id: "open-new-private-window",
  name: "Open new private window",
  icon: { type: "lucide", name: "EyeOff" },
  color: "orange",
  keybinding: "⌘ ⇧ n",
  execute: () => {
    createWindow({ incognito: true })
  },
}
