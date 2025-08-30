import type { ParentCommand, RunCommand } from "../../../types/"
import { getActiveTab, queryTabs, sendTabMessage } from "../../utils/browser"

export const copyTabUrl: ParentCommand = {
  id: "copy-tab-url",
  name: "Copy tab URL",
  icon: { name: "Copy" },
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
            return { url: tab.favIconUrl }
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
