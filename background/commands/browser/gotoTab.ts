import type { ParentCommand, RunCommand } from "../../../types"
import { getTab, queryTabs, updateTab, updateWindow } from "../../utils/browser"

export const gotoTab: ParentCommand = {
  id: "goto-tab",
  name: "Go to tab",
  icon: { name: "ArrowRightSquare" },
  color: "green",
  commands: async () => {
    const tabs = await queryTabs({ currentWindow: true })
    return tabs
      .filter((tab) => !!tab.title)
      .map((tab) => {
        const command: RunCommand = {
          id: `go-to-tab-${tab.id}`,
          name: async () => tab.title,
          icon: async () => {
            return { url: tab.favIconUrl }
          },
          run: async () => {
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

        return command
      })
  },
}
