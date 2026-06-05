import type { Browser, CommandNode } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"
import { browserCommands, firefoxCommands } from "./browser"
import { clearFavoritesCommand } from "./favorites"
import { newTabCommands } from "./newTab"
import { toolCommands } from "./tools"
import { uiCommands } from "./ui"
import { websiteCommands } from "./websites"

export type CommandLoadOptions = {
  platform?: Browser.Platform
}

const getPlatform = (options?: CommandLoadOptions): Browser.Platform => {
  return options?.platform ?? (isFirefox ? "firefox" : "chrome")
}

const supportsPlatform = (
  command: CommandNode,
  platform: Browser.Platform,
): boolean => {
  if (!command.supportedBrowsers) {
    return true
  }

  return command.supportedBrowsers.includes(platform)
}

export const loadAllCommands = (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): CommandNode[] => {
  const platform = getPlatform(options)
  const commands: CommandNode[] = [
    ...browserCommands,
    ...toolCommands,
    ...uiCommands,
    ...websiteCommands,
    clearFavoritesCommand,
  ]

  if (context?.isNewTab) {
    commands.push(...newTabCommands)
  }

  if (platform === "firefox") {
    commands.push(...firefoxCommands)
  }

  return commands.filter((command) => supportsPlatform(command, platform))
}

export const allCommands = loadAllCommands()
