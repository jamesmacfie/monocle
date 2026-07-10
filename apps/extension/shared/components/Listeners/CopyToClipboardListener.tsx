import { useEffect } from "react"
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard"
import { validateContentMessage } from "../../types/contentMessageValidation"
import { getBrowserAPI } from "../../utils/extension-api"

export default function CopyToClipboardListener() {
  const [_, copy] = useCopyToClipboard()
  useEffect(() => {
    const runtime = getBrowserAPI().runtime
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      const event = validateContentMessage(message)
      if (event?.type === "monocle-clipboard-write") {
        copy(event.message)

        sendResponse({ received: true })
        return true
      }
    }

    runtime.onMessage.addListener(handleMessage)

    return () => {
      runtime.onMessage.removeListener(handleMessage)
    }
  }, [copy])

  return null
}
