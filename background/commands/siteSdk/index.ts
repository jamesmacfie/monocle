import type { Browser } from "../../../shared/types"
import { sendTabMessage } from "../../utils/browser"
import type { CommandLoadOptions } from "../source"
import { createSiteSdkRootCommands } from "./commands"
import {
  clearAllSiteSdkRegistrations,
  clearSiteSdkScope,
  clearSiteSdkScopesForTab,
  getSiteSdkRegistryEntry,
  hasSiteSdkRegistryEntry,
  syncSiteSdkRegistrations,
} from "./registry"
import { createSiteSdkScopeFromSender, type SiteSdkScope } from "./scope"

export type SiteSdkCommandLoadOptions = {
  scopeKey: string
  revision: number
}

const inflightSync = new Map<string, Promise<void>>()

// A restarted MV3 service worker loses the in-memory registry. Before loading
// commands for a sender, ask that sender's content bridge to replay its latest
// page-world registrations.
const requestSiteSdkSync = async (scope: SiteSdkScope): Promise<void> => {
  const existing = inflightSync.get(scope.key)
  if (existing) {
    return await existing
  }

  const promise = (async () => {
    try {
      const response = await sendTabMessage(scope.tabId, {
        type: "monocle-sdk-sync-request",
      })

      if (Array.isArray(response?.registrations)) {
        syncSiteSdkRegistrations(scope, response.registrations)
      }
    } catch (error) {
      console.warn("[SiteSdk] Could not request site SDK sync:", error)
    }
  })()

  inflightSync.set(scope.key, promise)

  try {
    await promise
  } finally {
    if (inflightSync.get(scope.key) === promise) {
      inflightSync.delete(scope.key)
    }
  }
}

/**
 * Returns the lightweight option object threaded through command loading.
 *
 * The revision participates in search-index cache keys so SDK updates rebuild
 * the index without making every call carry the full registration tree.
 */
export const getSiteSdkCommandLoadOptions = (
  scopeKey?: string,
): CommandLoadOptions["siteSdk"] | undefined => {
  if (!scopeKey) return undefined

  const entry = getSiteSdkRegistryEntry(scopeKey)
  if (!entry) return undefined

  return {
    scopeKey,
    revision: entry.revision,
  }
}

/**
 * Prepares SDK command loading for one runtime message sender.
 *
 * If no registration is present, this may synchronously request a replay from
 * the sender tab before returning options.
 */
export const prepareSiteSdkCommandLoadOptions = async (
  sender: any,
  context?: Browser.Context,
): Promise<CommandLoadOptions["siteSdk"] | undefined> => {
  const scope = createSiteSdkScopeFromSender(sender, context)
  if (!scope) {
    return undefined
  }

  if (!hasSiteSdkRegistryEntry(scope.key)) {
    await requestSiteSdkSync(scope)
  }

  return getSiteSdkCommandLoadOptions(scope.key)
}

/**
 * Loads SDK commands for the already-prepared sender scope.
 *
 * Callers must pass options from `prepareSiteSdkCommandLoadOptions`; otherwise
 * no page-owned commands are visible.
 */
export const loadSiteSdkCommands = (
  options?: CommandLoadOptions["siteSdk"],
) => {
  return createSiteSdkRootCommands(
    options?.scopeKey ? getSiteSdkRegistryEntry(options.scopeKey) : undefined,
  )
}

export {
  clearAllSiteSdkRegistrations,
  clearSiteSdkScope,
  clearSiteSdkScopesForTab,
  createSiteSdkScopeFromSender,
  syncSiteSdkRegistrations,
}
export { isSiteSdkCommandId } from "./commands"
