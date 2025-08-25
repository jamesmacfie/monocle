import type { UICommand } from "../../../types";
import { queryTabs, sendTabMessage } from "../../utils/browser";

export const googleSearch: UICommand = {
  id: "google-search",
  name: "Google Search",
  icon: { name: "Search" },
  color: "teal",
  ui: [
    {
      id: "search",
      type: "input",
      placeholder: "Your search query",
    }
  ],
  run: async (context, values) => {
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      try {
        await sendTabMessage(activeTab.id, {
          type: "monocle-newTab",
          url: `https://www.google.com/search?q=${values?.search}`
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  },
}