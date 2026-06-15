/**
 * Utility functions for handling background messages with consistent error handling
 */

/**
 * Wraps a message handler function with standardized error handling
 * @param handler - The async function to handle the message
 * @param errorMessage - Custom error message for logging
 * @returns Wrapped handler with error handling
 */
export async function withErrorHandling<T, R>(
  handler: (message: T) => Promise<R>,
  errorMessage: string,
): Promise<(message: T) => Promise<R | { error: string }>> {
  return async (message: T) => {
    try {
      return await handler(message)
    } catch (error) {
      console.error(`[background] ${errorMessage}:`, error)
      return { error: errorMessage }
    }
  }
}

/**
 * Resolve the originating tab id from a runtime message sender.
 *
 * The id lives in one of two places depending on the browser and path: the raw
 * `sender.tab.id`, or the `validationContext.senderTab` that
 * `createCrossBrowserMessageHandler` stamps onto the sender (see runtime.ts).
 * `validationContext.senderTab` can be `null`, which is normalized to
 * `undefined` here. Handlers that need the sender tab should call this instead
 * of re-deriving the fallback inline.
 */
export function resolveSenderTabId(sender?: any): number | undefined {
  return sender?.tab?.id ?? sender?.validationContext?.senderTab ?? undefined
}

/**
 * Creates a message handler with error wrapping
 * @param handler - The handler function
 * @param errorMessage - Error message for failures
 */
export function createMessageHandler<T, R>(
  handler: (message: T, sender?: any) => Promise<R>,
  errorMessage: string,
) {
  return async (message: T, sender?: any): Promise<R | { error: string }> => {
    try {
      return await handler(message, sender)
    } catch (error) {
      console.error(`[background] ${errorMessage}:`, error)
      return { error: errorMessage }
    }
  }
}
