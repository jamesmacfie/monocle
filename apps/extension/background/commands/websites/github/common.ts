import type {
  ActionCommandNode,
  CommandIcon,
  CommandNode,
  GroupCommandNode,
} from "../../../../shared/types"
import {
  focusOrGoToUrl,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../../utils/browser"

/**
 * Builds an action that navigates the current tab to a GitHub URL. This is the
 * shared shape behind every URL-based GitHub command (tab nav, lists, create).
 */
export const createGithubLinkCommand = (params: {
  id: string
  name: string
  description: string
  url: string
  icon?: CommandIcon
  keywords?: string[]
  actionLabel?: string
  /** Disable custom keybindings for dynamic (e.g. search-result) ids. */
  allowCustomKeybinding?: boolean
}): ActionCommandNode => ({
  type: "action",
  id: params.id,
  name: params.name,
  description: params.description,
  icon: params.icon ?? { type: "lucide", name: "MoveRight" },
  keywords: ["github", ...(params.keywords ?? [])],
  actionLabel: params.actionLabel ?? "Go",
  allowCustomKeybinding: params.allowCustomKeybinding,
  execute: async () => {
    try {
      await focusOrGoToUrl(params.url)
      await sendSuccessToastToActiveTab(
        `Navigating to ${params.name.toLowerCase()}`,
      )
    } catch (error) {
      console.error("[GitHub Commands] Navigation failed", {
        error,
        url: params.url,
      })
      await sendErrorToastToActiveTab("Failed to navigate to GitHub page")
    }
  },
})

/**
 * Builds a sub-group whose children are baked at construction time. The parent
 * GitHub group has already parsed the page, so children ignore context.
 */
export const createGithubSubGroup = (params: {
  id: string
  name: string
  description: string
  icon: CommandIcon
  keywords?: string[]
  children: CommandNode[]
}): GroupCommandNode => ({
  type: "group",
  id: params.id,
  name: params.name,
  description: params.description,
  icon: params.icon,
  color: "gray",
  keywords: ["github", ...(params.keywords ?? [])],
  enableDeepSearch: true,
  children: async () => params.children,
})
