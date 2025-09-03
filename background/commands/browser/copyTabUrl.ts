import type { ParentCommand, RunCommand } from "../../../types/"
import { getActiveTab, queryTabs, sendTabMessage } from "../../utils/browser"
import { getFaviconIcon } from "../../utils/favicon"

export const copyTabUrl: ParentCommand = {
  id: "copy-tab-url",
  name: "Copy tab URL",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  commands: async () => {
    const tabs = await queryTabs({ currentWindow: true })
    return tabs
      .filter((tab) => !!tab.title)
      .map((tab) => {
        const command: RunCommand = {
          id: `copy-tab-url-${tab.id}`,
          name: async () => tab.title,
          icon: async () => {
            return await getFaviconIcon({
              browserFaviconUrl: tab.favIconUrl,
              url: tab.url,
            })
          },
          run: async () => {
            const activeTab = await getActiveTab()
            if (activeTab) {
              await sendTabMessage(activeTab.id, {
                type: "monocle-copyToClipboard",
                message: tab.url,
              })
            }
          },
        }

        return command
      })
  },
}
