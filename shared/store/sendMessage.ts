// Shared background-messaging factory for palette stores.
// Attaches the current page context to every message and wraps
// chrome.runtime.sendMessage in a Promise with lastError handling.
export const createPaletteSendMessage = (
  extraContext: Record<string, unknown> = {},
) => {
  return (message: any) =>
    new Promise((resolve, reject) => {
      const context = {
        title: document.title,
        url: window.location.href,
        modifierKey: null,
        ...extraContext,
      }
      const messageWithContext = { ...message, context }
      chrome.runtime.sendMessage(messageWithContext, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(response)
        }
      })
    })
}
