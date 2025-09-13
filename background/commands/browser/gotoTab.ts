import type { CommandNode } from "../../../shared/types"
import { getTab, queryTabs, updateTab, updateWindow } from "../../utils/browser"
import { getFaviconIcon } from "../../utils/favicon"

export const gotoTab: CommandNode = {
  type: "group",
  id: "goto-tab",
  name: "Go to tab",
  icon: { type: "lucide", name: "ArrowRightSquare" },
  color: "green",
  permissions: ["tabs"],
  children: async () => {
    const tabs = await queryTabs({ currentWindow: true })
    return tabs
      .filter((tab) => !!tab.title)
      .map((tab) => {
        const node: CommandNode = {
          type: "action",
          id: `go-to-tab-${tab.id}`,
          name: async () => tab.title!,
          icon: async () => {
            return await getFaviconIcon({
              browserFaviconUrl: tab.favIconUrl,
              url: tab.url,
            })
          },
          allowCustomKeybinding: false, // Dynamic tab commands shouldn't have custom keybindings
          execute: async () => {
            try {
              await updateTab(tab.id, { active: true })
              // Optional: Bring the window to the front if the tab is in another window
              const updatedTab = await getTab(tab.id)
              if (updatedTab.windowId) {
                await updateWindow(updatedTab.windowId, { focused: true })
              }
            } catch (error) {
              console.error(`Failed to switch to tab ID ${tab.id}:`, error)
            }
          },
        }

        return node
      })
  },
}
