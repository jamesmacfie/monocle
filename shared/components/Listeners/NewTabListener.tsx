import { useEffect } from "react"
import type { NewTabEvent } from "../../../shared/types"

export default function NewTabListener() {
  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-newTab") {
        const newTabEvent = message as NewTabEvent

        try {
          const url = new URL(newTabEvent.url)
          // Only allow safe URL schemes
          if (url.protocol === "http:" || url.protocol === "https:") {
            window.open(newTabEvent.url, "_blank")
          } else {
            console.warn("Blocked unsafe URL scheme:", url.protocol)
          }
        } catch (error) {
          console.error("Invalid URL:", newTabEvent.url, error)
        }

        sendResponse({ received: true })
        return true
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  return null
}
