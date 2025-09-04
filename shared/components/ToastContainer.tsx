import { useEffect, useState } from "react"
import type { ToastEvent } from "../../types/events"
import { Toast } from "./Toast"
import { v4 as uuidv4 } from "uuid"

interface ToastItem {
  id: string
  message: string
  level: "info" | "warning" | "success" | "error"
  timestamp: number
}

const _TOAST_DURATION = 5000
const _TOAST_EXIT_ANIMATION_DURATION = 300

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-toast") {
        const toastEvent = message as ToastEvent
        const newToast: ToastItem = {
          id: `toast-${uuidv4()}`,
          message: toastEvent.message,
          level: toastEvent.level,
          timestamp: Date.now(),
        }

        setToasts((prev) => [...prev, newToast])
        sendResponse({ received: true })
        return true
      }
    }

    // Cross-browser runtime API usage
    const runtime =
      typeof browser !== "undefined" ? browser.runtime : chrome.runtime
    runtime.onMessage.addListener(handleMessage)

    return () => {
      runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="fixed top-5 right-5 z-[10000] flex flex-col gap-2 pointer-events-none max-sm:top-2.5 max-sm:right-2.5 max-sm:left-2.5">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          level={toast.level}
          onRemove={removeToast}
          duration={_TOAST_DURATION}
        />
      ))}
    </div>
  )
}
