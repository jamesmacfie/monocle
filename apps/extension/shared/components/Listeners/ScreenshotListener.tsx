import { useEffect } from "react"
import { validateContentMessage } from "../../types/contentMessageValidation"
import { getBrowserAPI } from "../../utils/extension-api"

// Convert a base64 data URL into a Blob without using fetch(), so a page's
// connect-src CSP can't block reading our own screenshot data.
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ""] = dataUrl.split(",")
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? "image/png"
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

async function copyImageToClipboard(blob: Blob): Promise<void> {
  if (!navigator?.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image write not supported")
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function ScreenshotListener() {
  useEffect(() => {
    const runtime = getBrowserAPI().runtime
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      const event = validateContentMessage(message)
      if (event?.type !== "monocle-screenshot") {
        return
      }

      ;(async () => {
        try {
          const blob = dataUrlToBlob(event.dataUrl)
          if (event.mode === "clipboard") {
            await copyImageToClipboard(blob)
          } else {
            downloadBlob(blob, event.filename ?? "screenshot.png")
          }
          sendResponse({ received: true, success: true })
        } catch (error) {
          console.error("Failed to handle screenshot event:", error)
          sendResponse({ received: true, success: false })
        }
      })()

      // Keep the message channel open for the async work above.
      return true
    }

    runtime.onMessage.addListener(handleMessage)

    return () => {
      runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  return null
}
