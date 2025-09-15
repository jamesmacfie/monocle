import type { CommandNode, CommandSettings } from "../../shared/types"

/**
 * Extracts the domain from a full URL
 * Examples:
 * - https://github.com/user/repo -> github.com
 * - http://localhost:3000/path -> localhost:3000
 * - https://app.example.com/page -> app.example.com
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : "")
  } catch {
    // If URL parsing fails, try to extract domain manually
    const match = url.match(/^(?:https?:\/\/)?([^/]+)/)
    return match ? match[1] : url
  }
}

/**
 * Creates a URL pattern for a domain that matches all paths and subdomains
 * Examples:
 * - github.com -> *://*.github.com/*
 * - localhost:3000 -> *://localhost:3000/*
 */
export function createUrlPatternForDomain(domain: string): string {
  // List of local addresses that shouldn't have wildcard subdomains
  const LOCAL_ADDRESSES = ["localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]"]

  // Check if it's a local address
  const isLocalAddress = LOCAL_ADDRESSES.some((addr) => domain.startsWith(addr))

  // Check if it's an IP address (IPv4 or IPv6)
  const isIPAddress =
    /^\d+\.\d+\.\d+\.\d+/.test(domain) || /^\[?[0-9a-fA-F:]+\]?/.test(domain)

  // For localhost, IP addresses, don't add wildcard subdomain
  if (isLocalAddress || isIPAddress) {
    return `*://${domain}/*`
  }
  // For regular domains, allow subdomains
  return `*://*.${domain}/*`
}

/**
 * Validates a URL pattern
 * Returns true if valid, or an error message if invalid
 */
export function validateUrlPattern(pattern: string): true | string {
  if (!pattern || pattern.trim() === "") {
    return "Pattern cannot be empty"
  }

  // Check for some common invalid patterns
  if (pattern.includes(" ") && !pattern.includes("*")) {
    return "Pattern contains spaces - did you mean to use wildcards?"
  }

  // Try to convert to regex to check validity
  try {
    patternToRegex(pattern)
    return true
  } catch {
    return "Invalid pattern format"
  }
}

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
  let regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")

  // Treat '*.domain' segments as an optional subdomain so the base domain still matches
  regexStr = regexStr.replace(/\*\\\./g, "(?:.*\\.)?")

  // Convert remaining wildcards to greedy matches
  regexStr = regexStr.replace(/\*/g, ".*")

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
