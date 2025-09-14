import type { CommandNode } from "../../../shared/types"
import { getActiveTab, queryTabs, sendTabMessage } from "../../utils/browser"
import { getFaviconIcon } from "../../utils/favicon"

export const copyTabUrl: CommandNode = {
  type: "group",
  id: "copy-tab-url",
  name: "Copy tab URL",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  permissions: ["tabs"],
  children: async () => {
    const tabs = await queryTabs({ currentWindow: true })
    return tabs
      .filter((tab) => !!tab.title)
      .map((tab) => {
        const node: CommandNode = {
          type: "action",
          id: `copy-tab-url-${tab.id}`,
          name: async () => tab.title!,
          icon: async () => {
            return await getFaviconIcon({
              browserFaviconUrl: tab.favIconUrl,
              url: tab.url,
            })
          },
          execute: async () => {
            const activeTab = await getActiveTab()
            if (activeTab) {
              await sendTabMessage(activeTab.id, {
                type: "monocle-copyToClipboard",
                message: tab.url,
              })
              await sendTabMessage(activeTab.id, {
                type: "monocle-toast",
                level: "success",
                message: "URL copied to clipboard",
              })
            }
          },
        }

        return node
      })
  },
}
