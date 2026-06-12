import type { ActionCommandNode } from "../../../shared/types"
import { getCurrentWindow, updateWindow } from "../../utils/browser"

export const toggleFullscreen: ActionCommandNode = {
  type: "action",
  id: "toggle-fullscreen",
  name: "Toggle fullscreen",
  description: "Toggle fullscreen for the current window",
  icon: { type: "lucide", name: "Fullscreen" },
  color: "blue",
  keywords: ["fullscreen", "full", "screen", "window", "maximize"],
  execute: async () => {
    const currentWindow = await getCurrentWindow()
    if (!currentWindow?.id) {
      return
    }

    const nextState =
      currentWindow.state === "fullscreen" ? "normal" : "fullscreen"
    await updateWindow(currentWindow.id, { state: nextState })
  },
}
