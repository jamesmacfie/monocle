import type { CommandNode, CommandSettings } from "../../shared/types"

/**
 * Converts a URL pattern with wildcards to a regular expression
 * Supports patterns like:
 * - *.github.com/* (matches any subdomain of github.com)
 * - https://example.com/* (matches exact protocol and domain)
 * - *://example.com/* (matches any protocol)
 * - example.com (exact domain match)
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  let regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")

  // If pattern doesn't start with a protocol or wildcard, make it match any protocol
  if (!regexStr.startsWith(".*") && !regexStr.includes("://")) {
    regexStr = `.*://${regexStr}`
  }

  // If pattern doesn't end with anything after domain, match any path
  if (!regexStr.includes("/.*") && !regexStr.endsWith(".*")) {
    regexStr = `${regexStr}(/.*)?`
  }

  return new RegExp(`^${regexStr}$`, "i")
}

/**
 * Checks if a URL matches any of the given patterns
 */
export function matchesUrlPattern(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      const regex = patternToRegex(pattern)
      return regex.test(url)
    } catch (error) {
      console.error(`Invalid URL pattern: ${pattern}`, error)
      return false
    }
  })
}

/**
 * Determines if a command should be shown based on URL rules
 * Order of precedence:
 * 1. User deny list (highest priority)
 * 2. User allow list
 * 3. Command deny list
 * 4. Command allow list (lowest priority)
 *
 * If no rules are defined, command is allowed by default
 */
function shouldShowCommand(
  command: CommandNode,
  currentUrl: string,
  userSettings?: CommandSettings,
): boolean {
  const commandRules = command.urlRules
  const userRules = userSettings?.urlRules

  // Check user deny list first (highest priority)
  if (userRules?.denyUrls && userRules.denyUrls.length > 0) {
    if (matchesUrlPattern(currentUrl, userRules.denyUrls)) {
      return false
    }
  }

  // Check user allow list
  if (userRules?.allowUrls && userRules.allowUrls.length > 0) {
    // If user has an allow list, URL must match it
    return matchesUrlPattern(currentUrl, userRules.allowUrls)
  }

  // Check command deny list
  if (commandRules?.denyUrls && commandRules.denyUrls.length > 0) {
    if (matchesUrlPattern(currentUrl, commandRules.denyUrls)) {
      return false
    }
  }

  // Check command allow list
  if (commandRules?.allowUrls && commandRules.allowUrls.length > 0) {
    // If command has an allow list, URL must match it
    return matchesUrlPattern(currentUrl, commandRules.allowUrls)
  }

  // No rules defined, allow by default
  return true
}

/**
 * Filters an array of commands based on the current URL and user settings
 */
export async function filterCommandsByUrl(
  commands: CommandNode[],
  currentUrl: string,
  allUserSettings: Record<string, CommandSettings>,
): Promise<CommandNode[]> {
  // If no URL provided (e.g., new tab page), don't filter
  if (!currentUrl || currentUrl === "") {
    return commands
  }

  return commands.filter((command) => {
    const userSettings = allUserSettings[command.id]
    return shouldShowCommand(command, currentUrl, userSettings)
  })
}
