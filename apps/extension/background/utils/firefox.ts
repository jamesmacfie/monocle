/**
 * Firefox-specific browser features and utilities
 */
import { isFirefox } from "../../shared/utils/browser"

/**
 * Toggles reader mode for a tab (Firefox only)
 * @param tabId - The tab ID to toggle reader mode for
 */
export async function toggleReaderMode(tabId: number): Promise<void> {
  if (isFirefox && browser.tabs.toggleReaderMode) {
    return browser.tabs.toggleReaderMode(tabId)
  } else {
    return Promise.resolve()
  }
}

/**
 * Saves a tab as PDF (Firefox only)
 * @param options - PDF save options
 */
export async function saveAsPDF(options: any): Promise<void> {
  if (isFirefox && browser.tabs.saveAsPDF) {
    await browser.tabs.saveAsPDF(options)
    return Promise.resolve()
  } else {
    return Promise.resolve()
  }
}

// Containers only change when the user edits them in Firefox settings, but
// queryContainers is called during every keybinding registry rebuild — i.e. on
// each keystroke, once per container command group. Cache the (in-flight) query
// briefly so a burst of rebuilds coalesces into a single contextualIdentities
// call instead of one per keystroke per group. Caching the promise also dedupes
// concurrent callers. Only the parameterless query (all current callers) is
// cached; clear it with invalidateContainerCache when freshness matters.
const CONTAINER_CACHE_TTL_MS = 5_000
let containerCache: { result: Promise<any[]>; builtAt: number } | null = null

export const invalidateContainerCache = (): void => {
  containerCache = null
}

/**
 * Queries container profiles (Firefox only)
 * @param queryInfo - Query parameters for containers
 */
export async function queryContainers(queryInfo: any): Promise<any[]> {
  if (!(isFirefox && browser.contextualIdentities)) {
    return []
  }

  const cacheable = !queryInfo || Object.keys(queryInfo).length === 0
  if (!cacheable) {
    return browser.contextualIdentities.query(queryInfo)
  }

  if (
    containerCache &&
    Date.now() - containerCache.builtAt < CONTAINER_CACHE_TTL_MS
  ) {
    return containerCache.result
  }

  const result = browser.contextualIdentities.query(queryInfo)
  containerCache = { result, builtAt: Date.now() }
  // Never cache a rejection — let the next call retry.
  result.catch(() => {
    if (containerCache?.result === result) {
      containerCache = null
    }
  })
  return result
}
