import type { Command, ParentCommand } from "../../../../types/"
import { createTab } from "../../../utils/browser"
import { queryContainers } from "../../../utils/firefox"

export const openContainerTab: ParentCommand = {
  id: "open-container-tab",
  supportedBrowsers: ["firefox"],
  name: "Open container tab",
  description: "Open a new tab in a container profile",
  icon: { type: "lucide", name: "Box" },
  color: "green",
  permissions: ["contextualIdentities"],
  keywords: ["container", "tab", "profile"],
  commands: async (): Promise<Command[]> => {
    try {
      const containers = await queryContainers({})

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

        const command: Command = {
          id: `open-container-tab-${container.cookieStoreId}`,
          name: async () => profileName,
          icon: async () => {
            return { type: "url", url: container.iconUrl }
          },
          color: async () => colorCode,
          actionLabel: "New tab →",
          modifierActionLabel: {
            cmd: "New tab ←",
          },
          run: async (context) => {
            const options = {
              cookieStoreId: container.cookieStoreId,
              index: context?.modifierKey === "cmd" ? 0 : undefined,
            }
            await createTab(options)
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
