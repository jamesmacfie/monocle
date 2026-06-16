import { useEffect } from "react"
import { validateContentMessage } from "../../types/contentMessageValidation"

export default function NewTabListener() {
  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      const event = validateContentMessage(message)
      if (event?.type === "monocle-newTab") {
        try {
          const url = new URL(event.url)
          // Only allow safe URL schemes
          if (url.protocol === "http:" || url.protocol === "https:") {
            window.open(event.url, "_blank")
          } else {
            console.warn("Blocked unsafe URL scheme:", url.protocol)
          }
        } catch (error) {
          console.error("Invalid URL:", event.url, error)
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
