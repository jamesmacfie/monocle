import { useCallback, useEffect, useState } from "react"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

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

  // Handle keyboard shortcut (Cmd+J)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+J (metaKey for Mac, could add ctrlKey for Windows/Linux)
      if (event.key === "j" && event.metaKey) {
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
      } else if (message.type === "show-ui") {
        showUI()
      }
    }

    browserAPI.runtime.onMessage.addListener(handleBackgroundMessage)
    return () => {
      browserAPI.runtime.onMessage.removeListener(handleBackgroundMessage)
    }
  }, [toggleUI, showUI])

  return { isOpen, showUI, hideUI, toggleUI }
}
