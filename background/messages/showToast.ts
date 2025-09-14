import type { ShowToastMessage } from "../../shared/types"
import { getActiveTab } from "../utils/browser"

// Rate limiting state
const toastRateLimit = new Map<string, number>()
const RATE_LIMIT_WINDOW = 500 // 500ms between duplicate toasts

export const showToast = async (message: ShowToastMessage) => {
  // Rate limiting - prevent duplicate toasts within rate limit window
  const toastKey = `${message.level}:${message.message}`
  const now = Date.now()
  const lastToast = toastRateLimit.get(toastKey)

  if (lastToast && now - lastToast < RATE_LIMIT_WINDOW) {
    return { success: true, rateLimited: true }
  }

  // Update rate limit tracking
  toastRateLimit.set(toastKey, now)

  // Clean up old entries to prevent memory leaks
  for (const [key, timestamp] of toastRateLimit.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW * 2) {
      toastRateLimit.delete(key)
    }
  }

  // Send toast only to the active tab
  const activeTab = await getActiveTab()

  if (activeTab?.id) {
    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: "monocle-toast",
        level: message.level,
        message: message.message,
      })
    } catch (error) {
      // Ignore errors for tabs that can't receive messages (e.g., chrome:// pages)
      console.error(
        "[ShowToast] Failed to send toast to active tab",
        activeTab.id,
        error,
      )
    }
  }

  return { success: true }
}
