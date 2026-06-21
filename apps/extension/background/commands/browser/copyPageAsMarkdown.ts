import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyPageAsMarkdown: ActionCommandNode = {
  type: "action",
  id: "copy-page-as-markdown",
  name: "Copy page as Markdown",
  description: "Copy the main page content as Markdown",
  icon: { type: "lucide", name: "FileText" },
  color: "teal",
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }
    await sendTabMessage(activeTab.id, { type: "monocle-copy-page-markdown" })
  },
}
