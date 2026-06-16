import { callBrowserAPI } from "./browserApi"

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
    throw error
  }
}
