import type { RunCommand } from "../../../types/"
import { createWindow } from "../../utils/browser"

export const openNewPrivateWindow: RunCommand = {
  id: "open-new-private-window",
  name: "Open new private window",
  icon: { type: "lucide", name: "EyeOff" },
  color: "orange",
  keybinding: "⌘ ⇧ n",
  run: () => {
    createWindow({ incognito: true })
  },
}
