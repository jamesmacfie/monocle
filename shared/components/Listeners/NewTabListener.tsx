import { useEffect } from "react"
import type { NewTabEvent } from "../../../types"

export default function NewTabListener() {
  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-newTab") {
        const newTabEvent = message as NewTabEvent
        window.open(newTabEvent.url, "_blank")

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
