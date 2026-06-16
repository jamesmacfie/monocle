import type { SiteSdkRegistration } from "../../../shared/types"
import type { SiteSdkScope } from "./scope"

export type SiteSdkRegistryEntry = {
  scope: SiteSdkScope
  registrations: SiteSdkRegistration[]
  revision: number
  syncedAt: number
}

const registry = new Map<string, SiteSdkRegistryEntry>()

/**
 * Replaces the full registration snapshot for a scoped page document.
 *
 * Revisions intentionally advance on every sync so search-index cache keys can
 * change even when the scope itself stays stable.
 */
export const syncSiteSdkRegistrations = (
  scope: SiteSdkScope,
  registrations: SiteSdkRegistration[],
): SiteSdkRegistryEntry => {
  const existing = registry.get(scope.key)
  const entry: SiteSdkRegistryEntry = {
    scope,
    registrations,
    revision: (existing?.revision || 0) + 1,
    syncedAt: Date.now(),
  }

  registry.set(scope.key, entry)
  return entry
}

export const getSiteSdkRegistryEntry = (
  scopeKey: string,
): SiteSdkRegistryEntry | undefined => {
  return registry.get(scopeKey)
}

export const hasSiteSdkRegistryEntry = (scopeKey: string): boolean => {
  return registry.has(scopeKey)
}

export const clearSiteSdkScope = (scopeKey: string): boolean => {
  return registry.delete(scopeKey)
}

/**
 * Clears all SDK registrations for a tab.
 *
 * Used on navigation/removal because registrations are document-session state,
 * not durable extension settings.
 */
export const clearSiteSdkScopesForTab = (tabId: number): boolean => {
  let changed = false

  for (const [scopeKey, entry] of registry.entries()) {
    if (entry.scope.tabId === tabId) {
      registry.delete(scopeKey)
      changed = true
    }
  }

  return changed
}

export const clearAllSiteSdkRegistrations = (): void => {
  registry.clear()
}
