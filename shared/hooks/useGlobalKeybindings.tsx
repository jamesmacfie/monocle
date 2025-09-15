import { useEffect } from "react"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppSelector } from "../store/hooks"
import { selectIsCapturing } from "../store/slices/keybinding.slice"

// Cross-browser compatibility layer
const _browserAPI = typeof browser !== "undefined" ? browser : chrome

// Check if element is within the command palette
function isWithinCommandPalette(element: Element | null): boolean {
  if (!element) return false

  // Use closest() to efficiently check if we're inside a CMDK component
  return element.closest("[cmdk-root]") !== null
}

// Check if the active element is a context where we shouldn't capture keybindings
function shouldSkipKeybinding(
  element: Element | null,
  event: KeyboardEvent,
): boolean {
  if (!element) return false

  // Skip Enter key entirely when inside command palette to prevent conflicts
  if (event.key === "Enter" && isWithinCommandPalette(element)) {
    return true
  }

  const tagName = element.tagName.toLowerCase()
  const inputTags = ["input", "textarea", "select"]

  if (inputTags.includes(tagName)) {
    // Allow keybindings in command palette inputs (they have cmdk-input attribute)
    if (element.hasAttribute("cmdk-input")) {
      return false
    }

    // Check if modifier keys are pressed (excluding shift-only for capital letters)
    const hasNonShiftModifier = event.metaKey || event.ctrlKey || event.altKey

    // If we have non-shift modifiers, allow the keybinding (it's likely a global shortcut)
    if (hasNonShiftModifier) {
      return false
    }

    // Otherwise, skip the keybinding (normal typing)
    return true
  }

  // Also check for contenteditable elements
  if (element.getAttribute("contenteditable") === "true") {
    // Same logic for contenteditable
    const hasNonShiftModifier = event.metaKey || event.ctrlKey || event.altKey
    return !hasNonShiftModifier
  }

  return false
}

export function useGlobalKeybindings() {
  const sendMessage = useSendMessage()
  const isCapturing = useAppSelector(selectIsCapturing)

  useEffect(() => {
    // Track whether a multi‑stroke sequence is in progress so we keep
    // capturing subsequent strokes even without modifiers (e.g., "⌘ k, g").
    let sequenceActive = false
    let clearSequenceTimer: ReturnType<typeof setTimeout> | null = null
    const resetSequenceFlag = () => {
      sequenceActive = false
      if (clearSequenceTimer) {
        clearTimeout(clearSequenceTimer)
        clearSequenceTimer = null
      }
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      // Disable global keybindings while capturing a custom keybinding
      if (isCapturing) {
        return
      }
      // Check if we should skip this keybinding based on focus and modifiers,
      // unless we're mid-sequence (then we must capture the next stroke).
      if (
        !sequenceActive &&
        shouldSkipKeybinding(document.activeElement, event)
      ) {
        return
      }

      // Build keybinding string from event
      const parts = []
      if (event.metaKey) parts.push("⌘")
      if (event.ctrlKey) parts.push("⌃")
      if (event.altKey) parts.push("⌥")
      if (event.shiftKey) parts.push("⇧")

      // Handle special keys and normalize case
      let key = event.key
      if (key === "Enter") key = "↵"
      else if (key.length === 1) key = key.toLowerCase() // Changed to lowercase to match registry

      parts.push(key)
      const keybinding = parts.join(" ")

      // Skip if it's just a modifier key
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) {
        return
      }

      // Only allow single-char keys and Enter; ignore other special keys to avoid validation noise
      const isAllowedKey = key === "↵" || /^[a-z0-9]$/.test(key)
      if (!isAllowedKey) {
        return
      }

      // Try to execute (or continue) the keybinding sequence
      try {
        const response = await sendMessage({
          type: "execute-keybinding",
          keybinding,
        })

        // If background handled this stroke (executed or pending),
        // prevent default and stop propagation.
        if (response?.success) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
        }

        // Manage local sequence state based on background response
        if (response?.pending) {
          sequenceActive = true
          if (clearSequenceTimer) clearTimeout(clearSequenceTimer)
          // Match background chord timeout (slightly longer to be safe)
          clearSequenceTimer = setTimeout(() => {
            sequenceActive = false
            clearSequenceTimer = null
          }, 900)
        } else if (response?.executed) {
          // Command executed — clear local sequence state
          resetSequenceFlag()
        } else if (response && response.success === false) {
          // Unhandled — clear local sequence state so page regains control
          resetSequenceFlag()
        }
      } catch (_error) {
        // Silently ignore - this just means no command is bound to this key
        resetSequenceFlag()
      }
    }

    // Use capture: true to intercept before page handlers
    // Add passive: false to ensure we can preventDefault
    window.addEventListener("keydown", handleKeyDown, {
      capture: true,
      passive: false,
    })

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
      resetSequenceFlag()
    }
  }, [sendMessage, isCapturing])
}
