import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab } from "../../utils/browser"
import { deliverClipboard } from "../clipboardDelivery"

export const copyTitleAndUrl: ActionCommandNode = {
  type: "action",
  id: "copy-title-and-url",
  name: "Copy title + URL",
  description: "Copy the current page title and URL",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  keywords: ["copy", "title", "url", "link", "page"],
  external: { result: "value" },
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id || !activeTab.url) {
      return
    }
    const title = activeTab.title ?? activeTab.url
    const value = `${title}\n${activeTab.url}`
    await deliverClipboard(
      activeTab.id,
      value,
      "Title and URL copied to clipboard",
    )
    return { value }
  },
}
