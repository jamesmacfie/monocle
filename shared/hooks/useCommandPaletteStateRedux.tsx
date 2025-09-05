import { useCallback, useEffect } from "react"
import {
  useCommandPaletteDispatch,
  useCommandPaletteSelector,
} from "../store/commandPaletteHooks"
import {
  hideUI,
  selectIsOpen,
  showUI,
  toggleUI,
} from "../store/slices/commandPaletteState.slice"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

// Redux-based hook for managing command palette shortcuts and toggle state
export const useCommandPaletteStateRedux = () => {
  const dispatch = useCommandPaletteDispatch()
  const isOpen = useCommandPaletteSelector(selectIsOpen)

  const show = useCallback(() => {
    dispatch(showUI())
  }, [dispatch])

  const hide = useCallback(() => {
    dispatch(hideUI())
  }, [dispatch])

  const toggle = useCallback(() => {
    dispatch(toggleUI())
  }, [dispatch])

  // Handle keyboard shortcut (Cmd+/)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+/ (metaKey for Mac, could add ctrlKey for Windows/Linux)
      if (event.key.toLowerCase() === "k" && event.metaKey && event.shiftKey) {
        event.preventDefault()
        event.stopImmediatePropagation()
        toggle()
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
  }, [toggle, isOpen])

  // Handle background messages
  useEffect(() => {
    const handleBackgroundMessage = (
      message: any,
      _sender: browser.runtime.MessageSender | chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "toggle-ui") {
        toggle()
      } else if (message.type === "show-ui") {
        show()
      }
    }

    browserAPI.runtime.onMessage.addListener(handleBackgroundMessage)
    return () => {
      browserAPI.runtime.onMessage.removeListener(handleBackgroundMessage)
    }
  }, [toggle, show])

  return { isOpen, showUI: show, hideUI: hide, toggleUI: toggle }
}
