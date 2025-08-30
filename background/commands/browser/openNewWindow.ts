import type { RunCommand } from "../../../types/"
import { createWindow } from "../../utils/browser"

export const openNewWindow: RunCommand = {
  id: "open-new-window",
  name: "Open new window",
  icon: { type: "lucide", name: "AppWindow" },
  color: "purple",
  run: () => {
    createWindow({})
  },
}
