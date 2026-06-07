import { useEffect } from "react"
import type { ScrollEvent } from "../../../shared/types"

export default function ScrollListener() {
  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-scroll") {
        const scrollEvent = message as ScrollEvent
        const top =
          scrollEvent.direction === "top"
            ? 0
            : document.documentElement.scrollHeight

        window.scrollTo({ top, behavior: "smooth" })

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
