// Cross-browser detection utility
// Firefox extensions use moz-extension:// protocol while Chrome uses chrome-extension://
export const isFirefox = (() => {
  // Check if we're in a browser extension environment
  if (typeof chrome !== "undefined" && chrome.runtime) {
    return chrome.runtime.getURL("").startsWith("moz-extension://")
  }

  // Fallback to user agent detection if chrome.runtime is not available
  if (typeof navigator !== "undefined") {
    return navigator.userAgent.includes("Firefox")
  }

  return false
})()

export const isChrome = !isFirefox
