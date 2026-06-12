import { useEffect, useRef } from "react"
import type { InsertTextEvent } from "../../../shared/types"

// Selector matching Monocle's own UI: the content-mode shadow host (focus
// events from a closed shadow root retarget to the host element) and the
// new-tab palette wrapper. Focus moving into the palette must never
// overwrite the remembered page target.
const MONOCLE_UI_SELECTOR = "monocle-command-palette, #extension-root, .raycast"

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
])

const isEditableElement = (
  target: EventTarget | null,
): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest(MONOCLE_UI_SELECTOR)) return false
  if (target instanceof HTMLInputElement) {
    return (
      !target.disabled && !target.readOnly && TEXT_INPUT_TYPES.has(target.type)
    )
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly
  }
  return target.isContentEditable
}

// Insert text at the caret of the element. execCommand("insertText") is
// deprecated but remains the only selection-aware insertion that fires the
// input events React-controlled fields rely on, across inputs, textareas,
// and contenteditable. The manual splice below is the fallback for engines
// where it reports failure.
const insertAtCaret = (element: HTMLElement, text: string): boolean => {
  if (!element.isConnected) return false

  element.focus()

  try {
    if (document.execCommand("insertText", false, text)) {
      return true
    }
  } catch {
    // Fall through to the manual path.
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? element.value.length
    const newValue =
      element.value.slice(0, start) + text + element.value.slice(end)

    // Use the native value setter so React-controlled inputs observe the
    // change when the input event fires.
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    if (setter) {
      setter.call(element, newValue)
    } else {
      element.value = newValue
    }

    const caret = start + text.length
    element.setSelectionRange?.(caret, caret)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    return true
  }

  return false
}

// Tracks the page's last-focused editable element and inserts snippet text
// at its caret on `monocle-insertText`. Responds { inserted: boolean } so
// the background can fall back to a clipboard copy when nothing usable was
// focused (e.g. the new-tab page).
export default function InsertTextListener() {
  const lastEditableRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (isEditableElement(event.target)) {
        lastEditableRef.current = event.target
      }
    }

    // Capture phase so stopPropagation on the page can't hide focus changes.
    document.addEventListener("focusin", handleFocusIn, true)

    // The element focused before Monocle loaded (or before this listener
    // mounted) never fires focusin; seed from the current active element.
    if (isEditableElement(document.activeElement)) {
      lastEditableRef.current = document.activeElement
    }

    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-insertText") {
        const insertTextEvent = message as InsertTextEvent
        const target = lastEditableRef.current
        const inserted = target
          ? insertAtCaret(target, insertTextEvent.text)
          : false

        sendResponse({ inserted })
        return true
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      document.removeEventListener("focusin", handleFocusIn, true)
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  return null
}
