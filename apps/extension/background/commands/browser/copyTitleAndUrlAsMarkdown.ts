import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyTitleAndUrlAsMarkdown: ActionCommandNode = {
  type: "action",
  id: "copy-title-and-url-as-markdown",
  name: "Copy title + URL as a Markdown link",
  description: "Copy the current page as [title](url)",
  icon: { type: "lucide", name: "Link" },
  color: "teal",
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id || !activeTab.url) {
      return
    }
    const title = (activeTab.title ?? activeTab.url).replace(/[[\]]/g, "\\$&")
    const markdown = `[${title}](${activeTab.url})`
    await sendTabMessage(activeTab.id, {
      type: "monocle-copyToClipboard",
      message: markdown,
    })
    await sendTabMessage(activeTab.id, {
      type: "monocle-toast",
      level: "success",
      message: "Markdown link copied to clipboard",
    })
  },
}
