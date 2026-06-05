import { callBrowserAPI } from "./browserApi"

export async function getRecentlyClosed(): Promise<chrome.sessions.Session[]> {
  try {
    return await callBrowserAPI("sessions", "getRecentlyClosed", {
      maxResults: 25,
    })
  } catch (error) {
    console.error("Failed to get recently closed sessions:", error)
    throw error
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
