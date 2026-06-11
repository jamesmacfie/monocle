import type {
  Browser,
  CommandNode,
  SettingsCatalogCategoryId,
} from "../../shared/types"
import { browserCommands, firefoxCommands } from "./browser"
import { clearFavoritesCommand } from "./favorites"
import { newTabCommands } from "./newTab"
import { getPlatform, supportsPlatform } from "./platform"
import { loadSiteSdkCommands, type SiteSdkCommandLoadOptions } from "./siteSdk"
import { toolCommands } from "./tools"
import { uiCommands } from "./ui"
import { websiteCommands } from "./websites"

export type CommandLoadOptions = {
  platform?: Browser.Platform
  siteSdk?: SiteSdkCommandLoadOptions
}

export type CommandSourceCategory = {
  id: SettingsCatalogCategoryId
  label: string
}

export type LoadedCommandEntry = {
  command: CommandNode
  category: CommandSourceCategory
}

const categories = {
  browser: { id: "browser", label: "Browser" },
  tools: { id: "tools", label: "Tools" },
  ui: { id: "ui", label: "User Interface" },
  websites: { id: "websites", label: "Websites" },
  newTab: { id: "new-tab", label: "New Tab" },
  favorites: { id: "favorites", label: "Favorites" },
} satisfies Record<string, CommandSourceCategory>

const mapCommandsToEntries = (
  commands: CommandNode[],
  category: CommandSourceCategory,
): LoadedCommandEntry[] =>
  commands.map((command) => ({
    command,
    category,
  }))

export const loadCommandEntries = (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): LoadedCommandEntry[] => {
  const platform = getPlatform(options)
  const entries: LoadedCommandEntry[] = [
    ...mapCommandsToEntries(
      loadSiteSdkCommands(options?.siteSdk),
      categories.websites,
    ),
    ...mapCommandsToEntries(browserCommands, categories.browser),
    ...mapCommandsToEntries(toolCommands, categories.tools),
    ...mapCommandsToEntries(uiCommands, categories.ui),
    ...mapCommandsToEntries(websiteCommands, categories.websites),
    ...mapCommandsToEntries([clearFavoritesCommand], categories.favorites),
  ]

  if (context?.isNewTab) {
    entries.push(...mapCommandsToEntries(newTabCommands, categories.newTab))
  }

  if (platform === "firefox") {
    entries.push(...mapCommandsToEntries(firefoxCommands, categories.browser))
  }

  return entries.filter(({ command }) => supportsPlatform(command, platform))
}

export const loadAllCommands = (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): CommandNode[] => {
  return loadCommandEntries(context, options).map(({ command }) => command)
}

export const allCommands = loadAllCommands()
