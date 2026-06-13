// Architecture: background feature layer (Focus Mode). Decides whether a URL is
// on the focus blocklist, reusing the shared URL-pattern matcher so blocklist
// syntax matches command URL rules exactly. See docs/focus-mode.md.
import { matchesUrlPattern } from "../../utils/urlFilter"
import type { FocusConfig } from "./types"

export const isUrlBlocked = (url: string, config: FocusConfig): boolean => {
  if (!url || config.blockedUrlPatterns.length === 0) {
    return false
  }
  return matchesUrlPattern(url, config.blockedUrlPatterns)
}
