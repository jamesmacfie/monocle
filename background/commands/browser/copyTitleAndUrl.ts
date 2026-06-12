import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyTitleAndUrl: ActionCommandNode = {
  type: "action",
  id: "copy-title-and-url",
  name: "Copy title + URL",
  description: "Copy the current page title and URL",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  keywords: ["copy", "title", "url", "link", "page"],
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id || !activeTab.url) {
      return
    }
    const title = activeTab.title ?? activeTab.url
    await sendTabMessage(activeTab.id, {
      type: "monocle-copyToClipboard",
      message: `${title}\n${activeTab.url}`,
    })
    await sendTabMessage(activeTab.id, {
      type: "monocle-toast",
      level: "success",
      message: "Title and URL copied to clipboard",
    })
  },
}
