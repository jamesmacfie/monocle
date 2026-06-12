import type { ActionCommandNode } from "../../../shared/types"
import {
  createWindow,
  getActiveTab,
  sendErrorToastToActiveTab,
} from "../../utils/browser"

export const openPageInIncognito: ActionCommandNode = {
  type: "action",
  id: "open-page-in-incognito",
  name: "Open page in incognito window",
  description: "Open the current page in a new incognito window",
  icon: { type: "lucide", name: "EyeOff" },
  color: "orange",
  keywords: ["incognito", "private", "window", "open", "page"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.url) {
      return
    }

    try {
      await createWindow({ url: activeTab.url, incognito: true })
    } catch (error) {
      console.error("Failed to open page in incognito window:", error)
      await sendErrorToastToActiveTab(
        "Failed to open an incognito window. Allow Monocle in private windows and try again.",
      )
    }
  },
}
