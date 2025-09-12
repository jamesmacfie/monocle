import type { CommandNode } from "../../../types/"
import { createTab } from "../../utils/browser"

export const openNewTab: CommandNode = {
  type: "action",
  id: "open-new-tab",
  name: "Open new tab",
  icon: { type: "lucide", name: "PlusSquare" },
  color: "purple",
  keybinding: "⌘ t",
  actionLabel: "New tab →",
  modifierActionLabel: {
    shift: "New tab ←",
  },
  execute: async (context) => {
    const options = {
      index: context?.modifierKey === "cmd" ? 0 : undefined,
    }
    await createTab(options)
  },
}
