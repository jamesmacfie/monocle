/**
 * Cross-browser runtime utilities for consistent API usage
 */
import { isFirefox } from "./browser";

/**
 * Adds a runtime message listener with cross-browser compatibility
 * @param callback - The listener callback function
 */
export function addRuntimeListener(
  callback: (message: any, sender: any, sendResponse: any) => boolean | Promise<any>
): void {
  console.debug("[Background] Adding runtime listener");
  if (isFirefox) {
    browser.runtime.onMessage.addListener(callback);
  } else {
    chrome.runtime.onMessage.addListener(callback);
  }
}

/**
 * Creates a cross-browser compatible message handler wrapper
 * @param messageHandler - The message handler function
 * @returns A wrapped handler that works in both Chrome and Firefox
 */
export function createCrossBrowserMessageHandler(
  messageHandler: (message: any) => Promise<any>
) {
  return (message: any, sender: any, sendResponse: any) => {
    const responsePromise = messageHandler(message);

    // Return true to indicate we'll send a response asynchronously in Chrome
    if (!isFirefox) {
      responsePromise.then(sendResponse);
      return true;
    }

    return responsePromise;
  };
} 