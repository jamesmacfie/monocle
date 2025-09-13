import type { CommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const googleSearch: CommandNode = {
  type: "group",
  id: "google-search",
  name: "Google Search",
  icon: { type: "lucide", name: "Search" },
  color: "teal",
  async children() {
    return [
      {
        type: "input",
        id: "google-search-input",
        name: "Query",
        field: {
          id: "search",
          type: "text",
          label: "Query",
          placeholder: "Your search query",
        },
      },
      {
        type: "action",
        id: "google-search-execute",
        name: "Search",
        actionLabel: "Search",
        async execute(_context, values) {
          const activeTab = await getActiveTab()
          if (activeTab) {
            try {
              await sendTabMessage(activeTab.id, {
                type: "monocle-newTab",
                url: `https://www.google.com/search?q=${encodeURIComponent(values?.search || "")}`,
              })
            } catch (error) {
              console.error("Error sending message:", error)
            }
          }
        },
      },
    ]
  },
}
