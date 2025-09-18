import { useCallback, useEffect } from "react"
import { workflowExecutor } from "../../content/workflowExecutor"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import {
  hideUI,
  selectIsOpen,
  showUI,
  toggleUI,
} from "../store/slices/commandPaletteState.slice"
import type { Workflow } from "../types/workflow"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

// Redux-based hook for managing command palette shortcuts and toggle state
export const useCommandPaletteStateRedux = () => {
  const dispatch = useAppDispatch()
  const isOpen = useAppSelector(selectIsOpen)

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
    const handleBackgroundMessage = async (
      message: any,
      _sender: browser.runtime.MessageSender | chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "toggle-ui") {
        toggle()
      } else if (message.type === "show-ui") {
        show()
      } else if (message.type === "execute-workflow-content") {
        // Handle workflow execution in content script
        console.log("[Content] Received workflow execution request:", message)

        try {
          const result = await workflowExecutor.executeWorkflow(
            message.workflow as Workflow,
          )

          console.log("[Content] Workflow execution completed:", {
            success: result.success,
            error: result.error,
            stepCount: result.stepResults?.length || 0,
            fullResult: result,
          })

          sendResponse({ result })
        } catch (error) {
          console.error("[Content] Workflow execution failed:", {
            error,
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            workflow: message.workflow?.name,
          })

          sendResponse({
            result: {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          })
        }
        return true // Keep message channel open for async response
      }
    }

    browserAPI.runtime.onMessage.addListener(handleBackgroundMessage)
    return () => {
      browserAPI.runtime.onMessage.removeListener(handleBackgroundMessage)
    }
  }, [toggle, show])

  return { isOpen, showUI: show, hideUI: hide, toggleUI: toggle }
}
