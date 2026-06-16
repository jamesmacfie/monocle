import { isFirefox } from "../../shared/utils/browser"

export async function clearBrowserData(
  dataTypes: chrome.browsingData.DataTypeSet,
  startTime: number,
  _endTime?: number,
): Promise<void> {
  try {
    const options: chrome.browsingData.RemovalOptions = {
      since: startTime,
    }

    if (isFirefox && dataTypes.localStorage && startTime > 0) {
      await (browser as any).browsingData.removeLocalStorage({})
      delete dataTypes.localStorage
    }

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
