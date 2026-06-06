import type { Browser, CommandNode } from "../../shared/types"
import { browserCommands, firefoxCommands } from "./browser"
import { clearFavoritesCommand } from "./favorites"
import { newTabCommands } from "./newTab"
import { getPlatform, supportsPlatform } from "./platform"
import { toolCommands } from "./tools"
import { toggleTheme } from "./ui/theme"
import { websiteCommands } from "./websites"

type UserConfigurableCommandOptions = {
  platform?: Browser.Platform
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
