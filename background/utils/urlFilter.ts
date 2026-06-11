import type { CommandNode, CommandSettings } from "../../shared/types"

/**
 * Extracts the domain from a full URL
 * Examples:
 * - https://github.com/user/repo -> github.com
 * - http://localhost:3000/path -> localhost:3000
 * - https://app.example.com/page -> app.example.com
 */
/**
 * Normalizes a URL into a stable dedupe key for cross-source deduplication.
 * Strips hash, strips single trailing path slash, lowercases host, keeps query params.
 * Non-parseable URLs fall back to the trimmed raw string.
 */
export function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ""
    let path = u.pathname
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`
  } catch {
    return url.trim()
  }
}

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

const getHostnameFromDomain = (domain: string): string => {
  const trimmedDomain = domain.trim()

  if (trimmedDomain.startsWith("[")) {
    const closingBracketIndex = trimmedDomain.indexOf("]")
    return closingBracketIndex === -1
      ? trimmedDomain
      : trimmedDomain.slice(0, closingBracketIndex + 1)
  }

  const colonCount = (trimmedDomain.match(/:/g) ?? []).length
  if (colonCount > 1) {
    return trimmedDomain
  }

  return trimmedDomain.split(":")[0]
}

const stripIpv6Brackets = (hostname: string): string => {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname
}

const isIPv4Address = (hostname: string): boolean => {
  const parts = hostname.split(".")

  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false
      }

      const value = Number(part)
      return value >= 0 && value <= 255
    })
  )
}

const isIPv6Address = (hostname: string): boolean => {
  const normalizedHostname = stripIpv6Brackets(hostname)

  return (
    normalizedHostname.includes(":") &&
    /^[0-9a-fA-F:.]+$/.test(normalizedHostname)
  )
}

const isLocalhostOrIpAddress = (domain: string): boolean => {
  const hostname = getHostnameFromDomain(domain).toLowerCase()
  const normalizedHostname = stripIpv6Brackets(hostname)

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "0.0.0.0" ||
    isIPv4Address(normalizedHostname) ||
    isIPv6Address(normalizedHostname)
  )
}

/**
 * Creates a URL pattern for a domain that matches all paths and subdomains
 * Examples:
 * - github.com -> *://*.github.com/*
 * - localhost:3000 -> *://localhost:3000/*
 */
export function createUrlPatternForDomain(domain: string): string {
  const normalizedDomain = domain.trim()

  if (isLocalhostOrIpAddress(normalizedDomain)) {
    return `*://${normalizedDomain}/*`
  }

  return `*://*.${normalizedDomain}/*`
}

/**
 * Validates a URL pattern
 * Returns true if valid, or an error message if invalid
 */
export function validateUrlPattern(pattern: string): true | string {
  const normalizedPattern = pattern.trim()

  if (!normalizedPattern) {
    return "Pattern cannot be empty"
  }

  if (/\s/.test(normalizedPattern)) {
    return "Pattern cannot contain whitespace"
  }

  if (normalizedPattern.includes("://")) {
    const protocolMatch = normalizedPattern.match(/^([^:]+):\/\/(.*)$/)

    if (!protocolMatch) {
      return "Pattern protocol is invalid"
    }

    const [, protocol, rest] = protocolMatch
    if (!["*", "http", "https"].includes(protocol.toLowerCase())) {
      return "Pattern protocol must be http, https, or *"
    }

    const host = rest.split("/")[0]
    if (!host) {
      return "Pattern host cannot be empty"
    }
  } else {
    const host = normalizedPattern.split("/")[0]
    if (!host || host.startsWith(":")) {
      return "Pattern host cannot be empty"
    }
  }

  // Try to convert to regex to check validity
  try {
    patternToRegex(normalizedPattern)
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
// patternToRegex is pure (pattern string in, RegExp out), so compiled regexes
// are cached without invalidation; the size cap is a runaway guard far above
// any real pattern count. Failures are not cached so error behavior is
// unchanged. Without this, URL filtering recompiled every pattern for every
// entry on every search keystroke.
const regexCache = new Map<string, RegExp>()
const MAX_REGEX_CACHE = 500

function patternToRegex(pattern: string): RegExp {
  const normalizedPattern = pattern.trim()

  const cached = regexCache.get(normalizedPattern)
  if (cached) {
    return cached
  }

  // Escape special regex characters except *
  let regexStr = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")

  // Treat '*.domain' segments as an optional subdomain so the base domain still matches
  regexStr = regexStr.replace(/\*\\\./g, "(?:[^/]+\\.)?")

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

  const regex = new RegExp(`^${regexStr}$`, "i")

  if (regexCache.size >= MAX_REGEX_CACHE) {
    regexCache.clear()
  }
  regexCache.set(normalizedPattern, regex)

  return regex
}

/**
 * Checks if a URL matches any of the given patterns
 */
export function matchesUrlPattern(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.trim()

    if (!normalizedPattern) {
      return false
    }

    try {
      const regex = patternToRegex(normalizedPattern)
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
  if (userSettings?.hidden === true) {
    return false
  }

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
 * Per-command URL visibility check with the same precedence semantics as
 * filterCommandsByUrl. Used by the search index, which stores entries
 * pre-URL-filter and applies visibility at query time.
 */
export function isCommandVisibleForUrl(
  command: Pick<CommandNode, "urlRules">,
  currentUrl: string,
  userSettings?: CommandSettings,
): boolean {
  if (userSettings?.hidden === true) {
    return false
  }

  // If no URL provided (e.g., new tab page), don't filter
  if (!currentUrl || currentUrl === "") {
    return true
  }

  return shouldShowCommand(command as CommandNode, currentUrl, userSettings)
}

/**
 * Filters an array of commands based on the current URL and user settings
 */
export async function filterCommandsByUrl(
  commands: CommandNode[],
  currentUrl: string,
  allUserSettings: Record<string, CommandSettings>,
): Promise<CommandNode[]> {
  const visibleCommands = commands.filter(
    (command) => allUserSettings[command.id]?.hidden !== true,
  )

  // If no URL provided (e.g., new tab page), don't filter
  if (!currentUrl || currentUrl === "") {
    return visibleCommands
  }

  return visibleCommands.filter((command) => {
    const userSettings = allUserSettings[command.id]
    return shouldShowCommand(command, currentUrl, userSettings)
  })
}
