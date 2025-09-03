import type { ShowToastMessage } from "../../types/"

export const showToast = async (message: ShowToastMessage) => {
  console.debug(
    "[ShowToast] Broadcasting toast:",
    message.level,
    message.message,
  )

  // Broadcast toast event to all content scripts
  const tabs = await chrome.tabs.query({})

  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "monocle-toast",
          level: message.level,
          message: message.message,
        })
      } catch (error) {
        // Ignore errors for tabs that can't receive messages (e.g., chrome:// pages)
        console.debug("[ShowToast] Failed to send toast to tab", tab.id, error)
      }
    }
  }

  return { success: true }
}
