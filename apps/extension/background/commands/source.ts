// Architecture: background command system. Command loading and category
// registration — the single seam where command sources (browser, tools, UI,
// websites, site SDK wrappers, automations, new-tab, Firefox)
// are assembled into the platform-filtered command list consumed by
// query.ts, the search index, the settings catalog, and the keybinding
// registry. Adding a category means registering it here.
import type {
  Browser,
  CommandNode,
  SettingsCatalogCategoryId,
} from "../../shared/types"
import { automationCommands } from "../automations/commands"
import { getFeatureCommands } from "../features"
import { browserCommands, firefoxCommands } from "./browser"
import { loadExtensionSdkCommands } from "./extensionSdk"
import { extensionsCommands } from "./extensions"
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
  automations: { id: "automations", label: "Automations" },
  features: { id: "features", label: "Features" },
  extensions: { id: "extensions", label: "Extensions" },
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
    ...mapCommandsToEntries(automationCommands, categories.automations),
    ...mapCommandsToEntries(getFeatureCommands(context), categories.features),
    ...mapCommandsToEntries([clearFavoritesCommand], categories.favorites),
    ...mapCommandsToEntries(extensionsCommands, categories.extensions),
    // Peer-extension commands are durable + context-free (no per-request
    // sender), so they load for any context from the warmed registry cache.
    ...mapCommandsToEntries(loadExtensionSdkCommands(), categories.extensions),
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
