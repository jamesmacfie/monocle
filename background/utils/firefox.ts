/**
 * Firefox-specific browser features and utilities
 */
import { isFirefox } from "./browser"

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

/**
 * Queries container profiles (Firefox only)
 * @param queryInfo - Query parameters for containers
 */
export async function queryContainers(queryInfo: any): Promise<any[]> {
  if (isFirefox && browser.contextualIdentities) {
    return browser.contextualIdentities.query(queryInfo)
  }
  return []
}
