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
 * Creates a message handler with error wrapping
 * @param handler - The handler function
 * @param errorMessage - Error message for failures
 */
export function createMessageHandler<T, R>(
  handler: (message: T) => Promise<R>,
  errorMessage: string,
) {
  return async (message: T): Promise<R | { error: string }> => {
    try {
      return await handler(message)
    } catch (error) {
      console.error(`[background] ${errorMessage}:`, error)
      return { error: errorMessage }
    }
  }
}
