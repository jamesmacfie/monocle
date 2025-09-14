/**
 * Cross-browser runtime utilities for consistent API usage
 */
import { isFirefox } from "../../shared/utils/browser"

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
  if (isFirefox) {
    browser.runtime.onMessage.addListener(callback)
  } else {
    chrome.runtime.onMessage.addListener(callback)
  }
}

/**
 * Enhanced sender validation with additional security checks
 * @param sender - Message sender information
 * @param runtime - Browser runtime API
 * @returns Validation result with security context
 */
function validateMessageSender(
  sender: any,
  runtime: any,
): { valid: boolean; error?: string; context: any } {
  const context = {
    senderId: sender?.id || "unknown",
    senderUrl: sender?.url || "unknown",
    senderTab: sender?.tab?.id || null,
    timestamp: Date.now(),
  }

  // Validate sender is from this extension
  // sender.id will be our extension ID if from our content script or extension pages
  if (sender.id && sender.id !== runtime.id) {
    console.warn("[Security] Rejected message from external extension:", {
      ...context,
      ourId: runtime.id,
    })
    return { valid: false, error: "Unauthorized: External extension", context }
  }

  // Additional check: if sender.id is undefined and we have a URL,
  // it might be a direct message from a web page (not through our content script)
  // This shouldn't happen in normal operation since all our messages go through
  // chrome.runtime.sendMessage() which sets sender.id
  if (!sender.id && sender.url) {
    // Check if it's from an extension page (should have sender.id in that case)
    const extensionUrl = runtime.getURL("")
    if (!sender.url.startsWith(extensionUrl)) {
      console.warn("[Security] Rejected direct message from web page:", {
        ...context,
        extensionUrl,
      })
      return {
        valid: false,
        error: "Unauthorized: Direct web page access",
        context,
      }
    }
  }

  // Additional security checks
  if (sender.url) {
    // Block messages from suspicious URLs
    const suspiciousPatterns = [
      /data:/i, // Data URLs
      /javascript:/i, // JavaScript URLs
      /about:blank/i, // Blank pages (potential injection)
    ]

    if (suspiciousPatterns.some((pattern) => pattern.test(sender.url))) {
      console.warn("[Security] Rejected message from suspicious URL:", {
        ...context,
        pattern: suspiciousPatterns.find((p) => p.test(sender.url))?.source,
      })
      return { valid: false, error: "Unauthorized: Suspicious URL", context }
    }
  }

  return { valid: true, context }
}

/**
 * Creates a cross-browser compatible message handler wrapper with enhanced security
 * @param messageHandler - The message handler function
 * @returns A wrapped handler that works in both Chrome and Firefox
 */
export function createCrossBrowserMessageHandler(
  messageHandler: (message: any, sender: any) => Promise<any>,
) {
  return (message: any, sender: any, sendResponse: any) => {
    // Get the runtime API (Chrome or Firefox)
    const runtime = isFirefox ? browser.runtime : chrome.runtime

    // Enhanced sender validation
    const senderValidation = validateMessageSender(sender, runtime)
    if (!senderValidation.valid) {
      // Log security violation for monitoring
      console.error("[Security] Message sender validation failed:", {
        error: senderValidation.error,
        context: senderValidation.context,
        message:
          typeof message === "object" ? { type: message?.type } : "non-object",
      })

      sendResponse({ error: senderValidation.error })
      return false
    }

    // Add sender context to message handling
    const enhancedSender = {
      ...sender,
      validationContext: senderValidation.context,
    }

    const responsePromise = messageHandler(message, enhancedSender)

    // Return true to indicate we'll send a response asynchronously in Chrome
    if (!isFirefox) {
      responsePromise.then(sendResponse).catch((error) => {
        console.error("[MessageHandler] Error handling message:", {
          error: error.message,
          senderContext: senderValidation.context,
          messageType: message?.type || "unknown",
        })
        sendResponse({ error: error.message })
      })
      return true
    }

    return responsePromise
  }
}
