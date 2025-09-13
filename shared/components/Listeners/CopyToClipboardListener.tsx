import { useEffect } from "react"
import type { CopyToClipboardEvent } from "../../../shared/types"
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard"

export default function CopyToClipboardListener() {
  const [_, copy] = useCopyToClipboard()
  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-copyToClipboard") {
        const copyToClipboardEvent = message as CopyToClipboardEvent
        copy(copyToClipboardEvent.message)

        sendResponse({ received: true })
        return true
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [copy])

  return null
}
