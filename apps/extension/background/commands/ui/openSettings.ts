import type { CommandNode } from "../../../shared/types"
import { openOptionsPage } from "../../../shared/utils/extension-api"

export const openSettings: CommandNode = {
  type: "action",
  id: "open-settings",
  name: "Monocle Settings",
  description: "Open Monocle settings",
  icon: { type: "lucide", name: "Settings" },
  color: "gray",
  keywords: ["settings", "preferences", "options", "configure"],
  actionLabel: "Open",
  // Opens a Monocle extension page — nothing for an external app to host.
  external: { allowed: false },
  execute: async () => {
    await openOptionsPage()
  },
}
