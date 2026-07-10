import { useEffect } from "react"
import { validateContentMessage } from "../../types/contentMessageValidation"
import { getBrowserAPI } from "../../utils/extension-api"

const getLineScrollAmount = () => {
  const computed = window.getComputedStyle(document.documentElement)
  const lineHeight = Number.parseFloat(computed.lineHeight)
  return Number.isFinite(lineHeight) ? lineHeight * 3 : 120
}

const getViewportAmount = (axis: "x" | "y") =>
  axis === "x" ? window.innerWidth : window.innerHeight

const getScrollDelta = (scrollEvent: {
  axis: "x" | "y"
  amount: number
  unit: "line" | "viewport" | "pixel"
}) => {
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
    const runtime = getBrowserAPI().runtime
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      const event = validateContentMessage(message)
      if (event?.type === "monocle-scroll") {
        if (event.direction !== undefined) {
          const top =
            event.direction === "top"
              ? 0
              : document.documentElement.scrollHeight

          window.scrollTo({ top, behavior: "smooth" })
        } else if (event.edge !== undefined && event.axis !== undefined) {
          const target = event.edge === "start" ? 0 : undefined
          window.scrollTo({
            left:
              event.axis === "x"
                ? (target ?? document.documentElement.scrollWidth)
                : undefined,
            top:
              event.axis === "y"
                ? (target ?? document.documentElement.scrollHeight)
                : undefined,
            behavior: "smooth",
          })
        } else if (
          event.axis !== undefined &&
          event.amount !== undefined &&
          event.unit !== undefined
        ) {
          const delta = getScrollDelta({
            axis: event.axis,
            amount: event.amount,
            unit: event.unit,
          })
          window.scrollBy({
            left: event.axis === "x" ? delta : 0,
            top: event.axis === "y" ? delta : 0,
            behavior: "smooth",
          })
        }

        sendResponse({ received: true })
        return true
      }
    }

    runtime.onMessage.addListener(handleMessage)

    return () => {
      runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  return null
}
