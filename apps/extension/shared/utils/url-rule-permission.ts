// Architecture: shared pure helper. Derives a chrome.permissions origin match
// pattern from a urlRules allow pattern (the small glob dialect parsed by
// background/utils/urlFilter.ts patternToRegex / validateUrlPattern) so the
// Automations editor can show per-host permission status and request access
// inline. Pure string transform — no browser API, no React — so it is
// unit-testable and safe to import from the options UI without crossing the
// background boundary. The actual permissions.contains/request/remove calls
// live in the UI (gesture-bound; see ScopeRuleList).
//
// A wildcard in the host (`*` or a `*.sub` subdomain wildcard) is deliberately
// marked NOT grantable: the only permission that would cover it is effectively
// all-sites / a whole subdomain tree, so the editor requires a concrete host.

export type DerivedHostPermission =
  | { ok: false; reason: string }
  | {
      ok: true
      // The host as written (with any port / wildcard), for display.
      host: string
      // False when the host contains a wildcard — no inline grant offered.
      grantable: boolean
      // The origin match pattern(s) to pass to chrome.permissions. A pattern
      // with an explicit scheme yields one origin; a bare host or `*://`
      // yields both http and https (the `*` scheme would fall outside the
      // declared optional_host_permissions of http(s)://*/*).
      origins: string[]
    }

// chrome.permissions match patterns cannot carry a port, so strip it. Leave
// bracketed IPv6 literals and bare (multi-colon) IPv6 hosts intact.
const hostWithoutPort = (host: string): string => {
  if (host.startsWith("[")) {
    const end = host.indexOf("]")
    return end === -1 ? host : host.slice(0, end + 1)
  }
  const colonCount = (host.match(/:/g) ?? []).length
  return colonCount === 1 ? host.split(":")[0] : host
}

// A concrete (non-wildcard) host is plausible if it's a dotted name / IPv4, a
// bracketed IPv6 literal, or localhost. Single-label typos like "htt" are not.
const isPlausibleHost = (host: string): boolean => {
  const cleanHost = hostWithoutPort(host)
  return (
    cleanHost.includes(".") ||
    cleanHost.startsWith("[") ||
    cleanHost.toLowerCase() === "localhost"
  )
}

export const originPatternFromUrlRule = (
  pattern: string,
): DerivedHostPermission => {
  const normalized = pattern.trim()
  if (!normalized) {
    return { ok: false, reason: "Empty pattern" }
  }
  if (/\s/.test(normalized)) {
    return { ok: false, reason: "Pattern cannot contain whitespace" }
  }

  let scheme: "http" | "https" | "any"
  let rest: string

  if (normalized.includes("://")) {
    const match = normalized.match(/^([^:]+):\/\/(.*)$/)
    if (!match) {
      return { ok: false, reason: "Invalid pattern" }
    }
    const proto = match[1].toLowerCase()
    if (proto === "http") {
      scheme = "http"
    } else if (proto === "https") {
      scheme = "https"
    } else if (proto === "*") {
      scheme = "any"
    } else {
      return { ok: false, reason: "Protocol must be http, https, or *" }
    }
    rest = match[2]
  } else {
    // Bare host (e.g. "example.com") matches any protocol in urlRules.
    scheme = "any"
    rest = normalized
  }

  const host = rest.split("/")[0]
  if (!host || host.startsWith(":")) {
    return { ok: false, reason: "Pattern has no host" }
  }

  const hasWildcard = host.includes("*")
  // A concrete host must look like a real hostname — reject typos like "htt"
  // that would otherwise be requested as a (never-matching) origin. Wildcard
  // hosts skip this: they're reported as "not grantable" below, not invalid.
  if (!hasWildcard && !isPlausibleHost(host)) {
    return { ok: false, reason: "Enter a valid host, e.g. example.com" }
  }

  const grantable = !hasWildcard
  const cleanHost = hostWithoutPort(host)
  const origins =
    scheme === "any"
      ? [`http://${cleanHost}/*`, `https://${cleanHost}/*`]
      : [`${scheme}://${cleanHost}/*`]

  return { ok: true, host, grantable, origins }
}
