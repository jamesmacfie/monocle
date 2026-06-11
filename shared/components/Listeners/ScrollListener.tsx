import { useEffect } from "react"
import type { ScrollEvent } from "../../../shared/types"

const getLineScrollAmount = () => {
  const computed = window.getComputedStyle(document.documentElement)
  const lineHeight = Number.parseFloat(computed.lineHeight)
  return Number.isFinite(lineHeight) ? lineHeight * 3 : 120
}

const getViewportAmount = (axis: "x" | "y") =>
  axis === "x" ? window.innerWidth : window.innerHeight

const getScrollDelta = (
  scrollEvent: Extract<ScrollEvent, { amount: number }>,
) => {
  const base =
    scrollEvent.unit === "line"
      ? getLineScrollAmount()
      : scrollEvent.unit === "viewport"
        ? getViewportAmount(scrollEvent.axis)
        : 1

  return scrollEvent.amount * base
}

export default function ScrollListener() {
  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-scroll") {
        const scrollEvent = message as ScrollEvent

        if ("direction" in scrollEvent) {
          const top =
            scrollEvent.direction === "top"
              ? 0
              : document.documentElement.scrollHeight

          window.scrollTo({ top, behavior: "smooth" })
        } else if ("edge" in scrollEvent) {
          const target = scrollEvent.edge === "start" ? 0 : undefined
          window.scrollTo({
            left:
              scrollEvent.axis === "x"
                ? (target ?? document.documentElement.scrollWidth)
                : undefined,
            top:
              scrollEvent.axis === "y"
                ? (target ?? document.documentElement.scrollHeight)
                : undefined,
            behavior: "smooth",
          })
        } else {
          const delta = getScrollDelta(scrollEvent)
          window.scrollBy({
            left: scrollEvent.axis === "x" ? delta : 0,
            top: scrollEvent.axis === "y" ? delta : 0,
            behavior: "smooth",
          })
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
