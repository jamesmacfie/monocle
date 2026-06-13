import type { Event } from "../../shared/types/"
import { callBrowserAPI } from "./browserApi"

export async function sendTabMessage(
  tabId: number,
  message: Event,
): Promise<any> {
  return callBrowserAPI("tabs", "sendMessage", tabId, message)
}

export async function queryTabs(queryInfo: any): Promise<any[]> {
  return callBrowserAPI("tabs", "query", queryInfo)
}

// Sends a message to every open tab, swallowing per-tab failures (chrome://,
// extension, and discarded pages cannot receive content messages). Used to
// broadcast surface-store changes (monocle-surfaces-changed) so every content
// surface can re-query. See docs/surfaces.md.
export async function broadcastToAllTabs(message: Event): Promise<void> {
  const tabs = await queryTabs({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab?.id) {
        return
      }
      try {
        await sendTabMessage(tab.id, message)
      } catch {
        // Expected for tabs without a content script (chrome://, store pages).
      }
    }),
  )
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

export async function getActiveTab(): Promise<any | null> {
  const [activeTab] = await queryTabs({ active: true, currentWindow: true })
  return activeTab?.id ? activeTab : null
}

// Capture the visible area of a window and return a PNG data URL. Pass the
// window id explicitly so the options object isn't misread as the first
// positional argument in either Chrome or Firefox. Relies on the `activeTab`
// permission, which is granted whenever the palette is invoked.
export async function captureVisibleTab(windowId?: number): Promise<string> {
  return callBrowserAPI("tabs", "captureVisibleTab", windowId, {
    format: "png",
  })
}

export async function sendSuccessToastToActiveTab(
  message: string,
  event?: Partial<Event>,
): Promise<void> {
  const activeTab = await getActiveTab()
  if (activeTab) {
    await sendTabMessage(activeTab.id, {
      ...(event || {}),
      type: "monocle-toast",
      level: "success",
      message: message,
    })
  }
}

export async function sendErrorToastToActiveTab(
  message: string,
  event?: Partial<Event>,
): Promise<void> {
  const activeTab = await getActiveTab()
  if (activeTab) {
    await sendTabMessage(activeTab.id, {
      ...(event || {}),
      type: "monocle-toast",
      level: "error",
      message: message,
    })
  }
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
    await updateTab(tab.id, { active: true })
    return
  }

  const activeTab = await getActiveTab()
  if (activeTab) {
    await updateTab(activeTab.id, { url })
    return
  }

  await createTab({ url })
}
