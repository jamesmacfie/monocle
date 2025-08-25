import { useEffect } from "react";
import { useSendMessage } from "../../shared/hooks/useSendMessage";

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Check if the active element is an input field where we shouldn't capture keybindings
function shouldSkipKeybinding(
  element: Element | null,
  event: KeyboardEvent
): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  const inputTags = ["input", "textarea", "select"];

  if (inputTags.includes(tagName)) {
    // Allow keybindings in command palette inputs (they have cmdk-input attribute)
    if (element.hasAttribute("cmdk-input")) {
      return false;
    }

    // Check if modifier keys are pressed (excluding shift-only for capital letters)
    const hasNonShiftModifier = event.metaKey || event.ctrlKey || event.altKey;

    // If we have non-shift modifiers, allow the keybinding (it's likely a global shortcut)
    if (hasNonShiftModifier) {
      return false;
    }

    // Otherwise, skip the keybinding (normal typing)
    return true;
  }

  // Also check for contenteditable elements
  if (element.getAttribute("contenteditable") === "true") {
    // Same logic for contenteditable
    const hasNonShiftModifier = event.metaKey || event.ctrlKey || event.altKey;
    return !hasNonShiftModifier;
  }

  return false;
}

export function useGlobalKeybindings() {
  const sendMessage = useSendMessage();

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Check if we should skip this keybinding based on focus and modifiers
      if (shouldSkipKeybinding(document.activeElement, event)) {
        return;
      }

      // Build keybinding string from event
      const parts = [];
      if (event.metaKey) parts.push("⌘");
      if (event.ctrlKey) parts.push("⌃");
      if (event.altKey) parts.push("⌥");
      if (event.shiftKey) parts.push("⇧");

      // Handle special keys and normalize case
      let key = event.key;
      if (key === "Enter") key = "↵";
      else if (key.length === 1) key = key.toLowerCase(); // Changed to lowercase to match registry

      parts.push(key);
      const keybinding = parts.join(" ");

      // Skip if it's just a modifier key
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) {
        return;
      }

      // Try to execute the keybinding
      try {
        const response = await sendMessage({
          type: "execute-keybinding",
          keybinding,
        });

        // If a command was executed, prevent default and stop propagation
        if (response && response.success) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      } catch (error) {
        // Silently ignore - this just means no command is bound to this key
      }
    };

    // Use capture: true to intercept before page handlers
    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [sendMessage]);
}
