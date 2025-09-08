/**
 * Cross-browser runtime utilities for consistent API usage
 */
import { isFirefox } from "./browser"

/**
 * Adds a runtime message listener with cross-browser compatibility
 * @param callback - The listener callback function
 */
export function addRuntimeListener(
  callback: (
    message: any,
    sender: any,
    sendResponse: any,
  ) => boolean | Promise<any>,
): void {
  console.debug("[Background] Adding runtime listener")
  if (isFirefox) {
    browser.runtime.onMessage.addListener(callback)
  } else {
    chrome.runtime.onMessage.addListener(callback)
  }
}

/**
 * Creates a cross-browser compatible message handler wrapper
 * @param messageHandler - The message handler function
 * @returns A wrapped handler that works in both Chrome and Firefox
 */
export function createCrossBrowserMessageHandler(
  messageHandler: (message: any, sender: any) => Promise<any>,
) {
  return (message: any, sender: any, sendResponse: any) => {
    // Get the runtime API (Chrome or Firefox)
    const runtime = isFirefox ? browser.runtime : chrome.runtime

    // Validate sender is from this extension
    // sender.id will be our extension ID if from our content script or extension pages
    if (sender.id && sender.id !== runtime.id) {
      console.warn("[Security] Rejected message from external extension:", {
        senderId: sender.id,
        ourId: runtime.id,
        senderUrl: sender.url,
      })
      sendResponse({ error: "Unauthorized: External extension" })
      return false
    }

    // Additional check: if sender.id is undefined and we have a URL,
    // it might be a direct message from a web page (not through our content script)
    // This shouldn't happen in normal operation since all our messages go through
    // chrome.runtime.sendMessage() which sets sender.id
    if (!sender.id && sender.url) {
      // Check if it's from an extension page (should have sender.id in that case)
      const extensionUrl = runtime.getURL("")
      if (!sender.url.startsWith(extensionUrl)) {
        console.warn(
          "[Security] Rejected direct message from web page:",
          sender.url,
        )
        sendResponse({ error: "Unauthorized: Direct web page access" })
        return false
      }
    }

    const responsePromise = messageHandler(message, sender)

    // Return true to indicate we'll send a response asynchronously in Chrome
    if (!isFirefox) {
      responsePromise.then(sendResponse).catch((error) => {
        console.error("[MessageHandler] Error handling message:", error)
        sendResponse({ error: error.message })
      })
      return true
    }

    return responsePromise
  }
}
