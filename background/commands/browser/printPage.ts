import type { ActionCommandNode } from "../../../shared/types"
import { callBrowserAPI, getActiveTab } from "../../utils/browser"

export const printPage: ActionCommandNode = {
  type: "action",
  id: "print-page",
  name: "Print page",
  description: "Open the print dialog for the current page",
  icon: { type: "lucide", name: "Printer" },
  color: "blue",
  keywords: ["print", "page", "pdf", "paper", "dialog"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    await callBrowserAPI("scripting", "executeScript", {
      target: { tabId: activeTab.id },
      func: () => window.print(),
    })
  },
}
