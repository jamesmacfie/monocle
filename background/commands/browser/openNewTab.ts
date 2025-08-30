import type { RunCommand } from "../../../types/"
import { createTab } from "../../utils/browser"

export const openNewTab: RunCommand = {
  id: "open-new-tab",
  name: "Open new tab",
  icon: { name: "PlusSquare" },
  color: "purple",
  actionLabel: "New tab →",
  modifierActionLabel: {
    cmd: "New tab ←",
  },
  run: async (context) => {
    const options = {
      index: context?.modifierKey === "cmd" ? 0 : undefined,
    }
    await createTab(options)
  },
}
