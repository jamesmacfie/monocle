import { useCallback, useEffect, useState } from "react"
import { getBrowserAPI } from "../utils/extension-api"

// Cross-browser compatibility layer
const browserAPI = getBrowserAPI()

// Custom hook for managing command palette shortcuts and toggle state
export const useCommandPaletteState = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false)

  const toggleUI = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const showUI = useCallback(() => {
    setIsOpen(true)
  }, [])

  const hideUI = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Handle content-side palette shortcut.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "k" &&
        event.shiftKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        toggleUI()
        return
      }

      // Stop propagation of alphabetic keys when modal is open. This is to
      // prevent the webpages from having their own keyboard handlers fire off
      // when the cmdk modal is open
      if (isOpen && /^[a-zA-Z]$/.test(event.key)) {
        event.stopImmediatePropagation()
      }
    }

    // Use capture: true to run before other listeners
    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [toggleUI, isOpen])

  // Handle background messages
  useEffect(() => {
    const handleBackgroundMessage = (
      message: any,
      _sender: browser.runtime.MessageSender | chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "toggle-ui") {
        toggleUI()
        _sendResponse({ received: true })
      } else if (message.type === "show-ui") {
        showUI()
        _sendResponse({ received: true })
      }
    }

    browserAPI.runtime.onMessage.addListener(handleBackgroundMessage)
    return () => {
      browserAPI.runtime.onMessage.removeListener(handleBackgroundMessage)
    }
  }, [toggleUI, showUI])

  return { isOpen, showUI, hideUI, toggleUI }
}
