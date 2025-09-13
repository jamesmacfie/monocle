import type { CommandNode } from "../../../../shared/types"
import { createTab, queryTabs, removeTab } from "../../../utils/browser"
import { queryContainers } from "../../../utils/firefox"

export const openCurrentTabInContainer: CommandNode = {
  type: "group",
  id: "open-current-tab-in-container",
  supportedBrowsers: ["firefox"],
  name: "Open current tab in container",
  description: "Reopen the current tab in a container profile",
  icon: { type: "lucide", name: "RefreshCw" },
  color: "blue",
  permissions: ["tabs", "contextualIdentities"],
  keywords: ["container", "tab", "profile", "reopen", "current"],
  children: async (): Promise<CommandNode[]> => {
    try {
      const containers = await queryContainers({})
      const [currentTab] = await queryTabs({
        active: true,
        currentWindow: true,
      })

      const children = containers.map((container: any) => {
        const profileName =
          container.name ||
          `Unnamed Profile (${container.cookieStoreId.substring(0, 6)}...)`

        // Ensure we have a valid color
        let colorCode = container.colorCode || "lightBlue"
        if (colorCode === "toolbar") {
          // Toolbar is a special value, use gray
          colorCode = "gray"
        } else if (colorCode === "lightBlue" || !colorCode.startsWith("#")) {
          // Default container color, use lightBlue
          colorCode = "lightBlue"
        }
        // For other hex colors, keep them as-is since they're container-specific

        const command: CommandNode = {
          type: "action",
          id: `open-current-tab-in-container-${container.cookieStoreId}`,
          name: async () => profileName,
          icon: async () => {
            return { type: "url", url: container.iconUrl }
          },
          color: async () => colorCode,
          execute: async () => {
            if (currentTab?.url) {
              await createTab({
                url: currentTab.url,
                cookieStoreId: container.cookieStoreId,
              })
              if (currentTab.id !== undefined) {
                await removeTab(currentTab.id)
              }
            }
          },
        }

        return command
      })

      return children
    } catch (error) {
      console.error("❌ [commands] Failed to query containers:", error)
      return []
    }
  },
}
