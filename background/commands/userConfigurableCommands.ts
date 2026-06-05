import type { Browser, CommandNode } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"
import { browserCommands, firefoxCommands } from "./browser"
import { clearFavoritesCommand } from "./favorites"
import { newTabCommands } from "./newTab"
import { toolCommands } from "./tools"
import { toggleTheme } from "./ui/theme"
import { websiteCommands } from "./websites"

type UserConfigurableCommandOptions = {
  platform?: Browser.Platform
}

const getPlatform = (
  options?: UserConfigurableCommandOptions,
): Browser.Platform => {
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

const uniqueById = (commands: CommandNode[]): CommandNode[] => {
  const seenCommandIds = new Set<string>()
  const uniqueCommands: CommandNode[] = []

  for (const command of commands) {
    if (seenCommandIds.has(command.id)) {
      continue
    }

    seenCommandIds.add(command.id)
    uniqueCommands.push(command)
  }

  return uniqueCommands
}

export const loadUserConfigurableCommands = (
  options?: UserConfigurableCommandOptions,
): CommandNode[] => {
  const platform = getPlatform(options)
  const commands: CommandNode[] = [
    ...browserCommands,
    ...toolCommands,
    toggleTheme,
    ...websiteCommands,
    ...newTabCommands,
    clearFavoritesCommand,
  ]

  if (platform === "firefox") {
    commands.push(...firefoxCommands)
  }

  return uniqueById(
    commands.filter((command) => supportsPlatform(command, platform)),
  )
}
