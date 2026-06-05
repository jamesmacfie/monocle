import { callBrowserAPI } from "./browserApi"

export async function getRecentDownloads(limit: number = 20): Promise<any[]> {
  try {
    return await callBrowserAPI("downloads", "search", {
      orderBy: ["-startTime"],
      limit,
    })
  } catch (error) {
    console.error("Failed to get recent downloads:", error)
    throw error
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
