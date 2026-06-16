import { useCallback, useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import {
  hideUI,
  selectIsOpen,
  showUI,
  toggleUI,
} from "../store/slices/commandPaletteState.slice"
import { selectIsCapturing } from "../store/slices/keybinding.slice"
import { validateContentMessage } from "../types/contentMessageValidation"
import type { Workflow, WorkflowResult } from "../types/workflow"
import { getBrowserAPI } from "../utils/extension-api"

// Cross-browser compatibility layer
const browserAPI = getBrowserAPI()

type WorkflowRunner = (workflow: Workflow) => Promise<WorkflowResult>

// Redux-based hook for managing command palette shortcuts and toggle state.
// Content mode injects a workflow runner; extension-page modes can omit it.
export const useCommandPaletteStateRedux = (options?: {
  executeWorkflow?: WorkflowRunner
}) => {
  const dispatch = useAppDispatch()
  const isOpen = useAppSelector(selectIsOpen)
  const isCapturing = useAppSelector(selectIsCapturing)

  const show = useCallback(() => {
    dispatch(showUI())
  }, [dispatch])

  const hide = useCallback(() => {
    dispatch(hideUI())
  }, [dispatch])

  const toggle = useCallback(() => {
    dispatch(toggleUI())
  }, [dispatch])

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
        toggle()
        return
      }

      // Stop propagation of alphabetic keys when modal is open. This is to
      // prevent the webpages from having their own keyboard handlers fire off
      // when the cmdk modal is open. Skip this while a keybinding is being
      // captured, otherwise the capture UI never receives letter keystrokes.
      if (isOpen && !isCapturing && /^[a-zA-Z]$/.test(event.key)) {
        event.stopImmediatePropagation()
      }
    }

    // Use capture: true to run before other listeners
    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [toggle, isOpen, isCapturing])

  // Handle background messages
  useEffect(() => {
    const handleBackgroundMessage = (
      message: any,
      _sender: browser.runtime.MessageSender | chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      const parsed = validateContentMessage(message)
      if (!parsed) {
        return
      }

      if (parsed.type === "toggle-ui") {
        toggle()
        sendResponse({ received: true })
      } else if (parsed.type === "show-ui") {
        show()
        sendResponse({ received: true })
      } else if (parsed.type === "hide-ui") {
        // Hide the palette and only acknowledge once the overlay has actually
        // been removed from the screen. Two animation frames ensures React has
        // committed the unmount and the browser has painted the result, so a
        // follow-up screenshot capture won't include the palette.
        hide()
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            sendResponse({ received: true })
          })
        })
        return true
      } else if (parsed.type === "execute-workflow-content") {
        if (!options?.executeWorkflow) {
          sendResponse({
            result: {
              success: false,
              error: "Workflow execution is unavailable in this host",
            },
          })
          return true
        }

        // Keep this listener synchronous. Some runtimes treat an async
        // listener's returned Promise as the message response.
        options
          .executeWorkflow(parsed.workflow)
          .then((result) => {
            sendResponse({ result })
          })
          .catch((error) => {
            console.error("[Content] Workflow execution failed:", {
              error,
              message: error instanceof Error ? error.message : "Unknown error",
              stack: error instanceof Error ? error.stack : undefined,
              workflow: parsed.workflow.name,
            })

            sendResponse({
              result: {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              },
            })
          })
        return true
      }
    }

    browserAPI.runtime.onMessage.addListener(handleBackgroundMessage)
    return () => {
      browserAPI.runtime.onMessage.removeListener(handleBackgroundMessage)
    }
  }, [toggle, show, hide, options?.executeWorkflow])

  return { isOpen, showUI: show, hideUI: hide, toggleUI: toggle }
}
