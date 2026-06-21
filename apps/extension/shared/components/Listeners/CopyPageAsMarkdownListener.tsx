import { Readability } from "@mozilla/readability"
import { useEffect } from "react"
import TurndownService from "turndown"
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard"
import { useToast } from "../../hooks/useToast"
import { validateContentMessage } from "../../types/contentMessageValidation"

export default function CopyPageAsMarkdownListener() {
  const [_, copy] = useCopyToClipboard()
  const toast = useToast()

  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      const event = validateContentMessage(message)
      if (event?.type !== "monocle-copy-page-markdown") {
        return
      }

      // ponytail: Readability is best-effort; on pages it can't parse
      // (apps, dashboards) we fall back to converting the whole body.
      let title: string | null = null
      let html = document.body.innerHTML
      try {
        const parsed = new Readability(
          document.cloneNode(true) as Document,
        ).parse()
        if (parsed?.content) {
          title = parsed.title ?? null
          html = parsed.content
        }
      } catch {
        // keep the body fallback
      }

      const body = new TurndownService().turndown(html)
      const markdown = title ? `# ${title}\n\n${body}` : body

      copy(markdown).then((ok) => {
        toast(
          ok ? "success" : "error",
          ok ? "Page copied as Markdown" : "Failed to copy page",
        )
      })

      sendResponse({ received: true })
      return true
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [copy, toast])

  return null
}
