import type { Event } from "../../shared/types/"
import { isFirefox } from "../../shared/utils/browser"
import type { BrowserAPIObject } from "../types/"

// Generic wrapper to handle API methods that exist in both browsers but with different signatures
export function callBrowserAPI(
  apiObject: BrowserAPIObject,
  method: string,
  ...args: any[]
): Promise<any> {
  if (isFirefox) {
    return (browser[apiObject] as any)[method](...args)
  } else {
    return new Promise((resolve, reject) => {
      ;(chrome[apiObject] as any)[method](...args, (result: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(result)
        }
      })
    })
  }
}

export async function sendTabMessage(
  tabId: number,
  message: Event,
): Promise<any> {
  return callBrowserAPI("tabs", "sendMessage", tabId, message)
}

export async function queryTabs(queryInfo: any): Promise<any[]> {
  return callBrowserAPI("tabs", "query", queryInfo)
}

export async function updateTab(
  tabId: number,
  updateProperties: any,
): Promise<any> {
  return callBrowserAPI("tabs", "update", tabId, updateProperties)
}

export async function createTab(createProperties: any): Promise<any> {
  return callBrowserAPI("tabs", "create", createProperties)
}

export async function removeTab(tabId: number): Promise<void> {
  return callBrowserAPI("tabs", "remove", tabId)
}

export async function getTab(tabId: number): Promise<any> {
  return callBrowserAPI("tabs", "get", tabId)
}

export async function createWindow(createData: any): Promise<any> {
  return callBrowserAPI("windows", "create", createData)
}

export async function getActiveTab(): Promise<any | null> {
  const [activeTab] = await queryTabs({ active: true, currentWindow: true })
  return activeTab?.id ? activeTab : null
}

export async function getCurrentWindow(): Promise<any> {
  return callBrowserAPI("windows", "getCurrent")
}

export async function updateWindow(
  windowId: number,
  updateInfo: any,
): Promise<any> {
  return callBrowserAPI("windows", "update", windowId, updateInfo)
}

export async function removeWindow(windowId: number): Promise<void> {
  return callBrowserAPI("windows", "remove", windowId)
}

export async function focusOrGoToUrl(url: string): Promise<void> {
  const tabs = await queryTabs({})
  const tab = tabs.find((tab) => {
    if (!tab.url || !url) {
      return false
    }
    try {
      const tabUrl = new URL(tab.url)
      const searchUrl = new URL(url)
      return tabUrl.href === searchUrl.href
    } catch (_e) {
      return tab.url === url
    }
  })

  if (tab) {
    // If the tab is found, go to it
    await updateTab(tab.id, { active: true })
  } else {
    // Update current tab with URL if it exists
    const activeTab = await getActiveTab()
    if (activeTab) {
      await updateTab(activeTab.id, { url })
    } else {
      // If the tab is not found, create a new tab
      await createTab({ url })
    }
  }
}

export async function getBookmarkTree(): Promise<any[]> {
  try {
    if (isFirefox) {
      // Firefox uses browser.bookmarks which returns Promise directly
      return await (browser as any).bookmarks.getTree()
    } else {
      // Chrome uses chrome.bookmarks with callback
      return await callBrowserAPI("bookmarks", "getTree")
    }
  } catch (error) {
    console.error("Failed to get bookmark tree:", error)
    return []
  }
}

export async function getBookmarkChildren(id: string): Promise<any[]> {
  try {
    if (isFirefox) {
      // Firefox uses browser.bookmarks which returns Promise directly
      return await (browser as any).bookmarks.getChildren(id)
    } else {
      // Chrome uses chrome.bookmarks with callback
      return await callBrowserAPI("bookmarks", "getChildren", id)
    }
  } catch (error) {
    console.error("Failed to get bookmark children:", error)
    return []
  }
}

export async function clearBrowserData(
  dataTypes: chrome.browsingData.DataTypeSet,
  startTime: number,
  _endTime?: number,
): Promise<void> {
  try {
    const options: chrome.browsingData.RemovalOptions = {
      since: startTime,
    }

    // Handle localStorage separately for Firefox
    if (isFirefox && dataTypes.localStorage && startTime > 0) {
      await (browser as any).browsingData.removeLocalStorage({})
      delete dataTypes.localStorage
    }

    // Remove the data using browsingData API
    if (Object.keys(dataTypes).length > 0) {
      await (browser as any).browsingData.remove(options, dataTypes)
    }
  } catch (error) {
    console.error("Failed to clear browser data:", error)
    throw error
  }
}

export async function clearHistory(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ history: true }, startTime, endTime)
}

export async function clearCookies(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ cookies: true }, startTime, endTime)
}

export async function clearCache(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ cache: true }, startTime, endTime)
}

export async function clearDownloads(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ downloads: true }, startTime, endTime)
}

export async function clearFormData(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ formData: true }, startTime, endTime)
}

export async function clearLocalStorage(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ localStorage: true }, startTime, endTime)
}

export async function clearIndexedDB(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ indexedDB: true }, startTime, endTime)
}

export async function clearServiceWorkers(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ serviceWorkers: true }, startTime, endTime)
}

export async function clearPasswords(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ passwords: true }, startTime, endTime)
}

export async function clearPluginData(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData({ pluginData: true }, startTime, endTime)
}

export async function clearAllBrowserData(
  startTime: number,
  endTime?: number,
): Promise<void> {
  return clearBrowserData(
    {
      history: true,
      cookies: true,
      cache: true,
      downloads: true,
      formData: true,
      localStorage: true,
      indexedDB: true,
      serviceWorkers: true,
      passwords: true,
      pluginData: true,
    },
    startTime,
    endTime,
  )
}

// Downloads API functions
export async function getRecentDownloads(limit: number = 20): Promise<any[]> {
  try {
    return await callBrowserAPI("downloads", "search", {
      orderBy: ["-startTime"],
      limit,
    })
  } catch (error) {
    console.error("Failed to get recent downloads:", error)
    return []
  }
}

export async function openDownload(downloadId: number): Promise<void> {
  try {
    return await callBrowserAPI("downloads", "open", downloadId)
  } catch (error) {
    console.error("Failed to open download:", error)
    throw error
  }
}

export async function showDownload(downloadId: number): Promise<void> {
  try {
    return await callBrowserAPI("downloads", "show", downloadId)
  } catch (error) {
    console.error("Failed to show download:", error)
    throw error
  }
}

// History API functions
export async function getHistoryItems(
  query?: chrome.history.HistoryQuery,
): Promise<chrome.history.HistoryItem[]> {
  try {
    return await callBrowserAPI(
      "history",
      "search",
      query || {
        text: "",
        maxResults: 1000,
      },
    )
  } catch (error) {
    console.error("Failed to get history items:", error)
    return []
  }
}

// Sessions API functions
export async function getRecentlyClosed(): Promise<chrome.sessions.Session[]> {
  try {
    return await callBrowserAPI("sessions", "getRecentlyClosed", {
      maxResults: 25,
    })
  } catch (error) {
    console.error("Failed to get recently closed sessions:", error)
    return []
  }
}

export async function restoreSession(
  sessionId?: string,
): Promise<chrome.sessions.Session | null> {
  try {
    return await callBrowserAPI("sessions", "restore", sessionId)
  } catch (error) {
    console.error("Failed to restore session:", error)
    throw error
  }
}
