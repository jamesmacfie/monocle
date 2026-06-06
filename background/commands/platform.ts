import type { Browser, CommandNode } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"

// Shared platform resolution and support filtering for command loaders
export const getPlatform = (options?: {
  platform?: Browser.Platform
}): Browser.Platform => {
  return options?.platform ?? (isFirefox ? "firefox" : "chrome")
}

export const supportsPlatform = (
  command: CommandNode,
  platform: Browser.Platform,
): boolean => {
  if (!command.supportedBrowsers) {
    return true
  }

  return command.supportedBrowsers.includes(platform)
}
