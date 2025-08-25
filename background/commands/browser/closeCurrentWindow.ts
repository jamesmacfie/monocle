import type { RunCommand } from "../../../types";
import { getCurrentWindow, removeWindow } from "../../utils/browser";

export const closeCurrentWindow: RunCommand = {
  id: "close-current-window",
  name: "Close current window",
  icon: { name: 'XOctagon' },
  color: "red",
  run: async () => {
    const current_window = await getCurrentWindow();
    if (current_window.id) {
      await removeWindow(current_window.id);
    }
  },
}