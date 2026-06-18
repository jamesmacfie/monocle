import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab } from "../../utils/browser"
import { deliverClipboard } from "../clipboardDelivery"

export const copyTitleAndUrlAsMarkdown: ActionCommandNode = {
  type: "action",
  id: "copy-title-and-url-as-markdown",
  name: "Copy title + URL as a Markdown link",
  description: "Copy the current page as [title](url)",
  icon: { type: "lucide", name: "Link" },
  color: "teal",
  external: { result: "value" },
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id || !activeTab.url) {
      return
    }
    const title = (activeTab.title ?? activeTab.url).replace(/[[\]]/g, "\\$&")
    const value = `[${title}](${activeTab.url})`
    await deliverClipboard(
      activeTab.id,
      value,
      "Markdown link copied to clipboard",
    )
    return { value }
  },
}
