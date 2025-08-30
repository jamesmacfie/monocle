import type { UICommand } from "../../../types/"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const googleSearch: UICommand = {
  id: "google-search",
  name: "Google Search",
  icon: { type: "lucide", name: "Search" },
  color: "teal",
  ui: [
    {
      id: "search",
      type: "text",
      placeholder: "Your search query",
    },
  ],
  run: async (_context, values) => {
    const activeTab = await getActiveTab()
    if (activeTab) {
      try {
        await sendTabMessage(activeTab.id, {
          type: "monocle-newTab",
          url: `https://www.google.com/search?q=${values?.search}`,
        })
      } catch (error) {
        console.error("Error sending message:", error)
      }
    }
  },
}
