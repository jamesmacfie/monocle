import type { CommandNode } from "../../../shared/types"
import { getActiveTab, queryTabs } from "../../utils/browser"
import { getFaviconIcon } from "../../utils/favicon"
import { deliverClipboard } from "../clipboardDelivery"

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
          external: { result: "value" },
          execute: async () => {
            const activeTab = await getActiveTab()
            if (activeTab) {
              await deliverClipboard(
                activeTab.id,
                tab.url,
                "URL copied to clipboard",
              )
            }
            return { value: tab.url }
          },
        }

        return node
      })
  },
}
