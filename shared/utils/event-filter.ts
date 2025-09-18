/**
 * Determines when keyboard events should be captured vs passed through
 */

import { getKeyChar, isModifier } from "./key-normalizer"

/**
 * Determine if a keyboard event should be captured by the extension
 */
export function shouldCapture(event: KeyboardEvent): boolean {
  // Skip modifier-only keys
  if (isModifier(event)) {
    return false
  }

  // Get the actual target element (handles shadow DOM)
  const actualTarget = getActualEventTarget(event)

  // NEVER capture events when inside the command palette UI
  // This allows CMDK to handle all keyboard input normally
  if (isWithinCommandPalette(actualTarget)) {
    return false
  }

  // In editable elements, be more selective
  if (isEditableElement(actualTarget)) {
    // If it's a text editing shortcut, don't capture it
    if (isTextEditingShortcut(event)) {
      return false
    }

    // If it has modifiers (Cmd/Ctrl/Alt), it might be an extension shortcut
    // Let it through for checking against registered keybindings
    if (hasNonShiftModifier(event)) {
      return true // Allow potential extension shortcuts with modifiers
    }

    // For regular typing (no modifiers), don't capture
    return false
  }

  // Always allow common copy/paste commands to pass through unless in editable elements
  // These should work normally on any page
  if (isCommonBrowserShortcut(event)) {
    return false
  }

  // Don't capture basic navigation keys without modifiers
  // These should work normally for page navigation
  if (isBasicNavigationKey(event)) {
    return false
  }

  // Don't block browser shortcuts here - let the keybinding system decide
  // The keybinding system will check if user has overridden these
  // Only block critical browser shortcuts that should never be overridden
  if (isCriticalBrowserShortcut(event)) {
    return false
  }

  return true
}

/**
 * Get the actual event target, resolving through shadow DOM if necessary
 */
export function getActualEventTarget(event: Event): Element | null {
  // Use composedPath to get the actual target inside shadow DOM
  if (event.composedPath && event.composedPath().length > 0) {
    const firstElement = event.composedPath()[0]
    if (firstElement instanceof Element) {
      return firstElement
    }
  }

  // Fallback to regular target
  return event.target as Element | null
}

/**
 * Check if element is editable and should receive keystrokes
 */
export function isEditableElement(element: Element | null): boolean {
  if (!element) return false

  const tagName = element.tagName?.toLowerCase()

  // Standard HTML input elements
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true
  }

  // ContentEditable elements (handle "true", empty string, and "plaintext-only")
  const contentEditable = element.getAttribute("contenteditable")
  if (
    contentEditable === "true" ||
    contentEditable === "" ||
    contentEditable === "plaintext-only"
  ) {
    return true
  }

  // Check if element has inputmode attribute (mobile/virtual keyboard hint)
  if (element.hasAttribute("inputmode")) {
    return true
  }

  // ARIA-based input elements (common in modern web apps)
  const role = element.getAttribute("role")
  if (role) {
    const inputRoles = [
      "textbox",
      "combobox",
      "searchbox",
      "spinbutton",
      "listbox",
      "grid",
    ]
    if (inputRoles.includes(role.toLowerCase())) {
      return true
    }
  }

  // Check for popular code editor libraries
  // Monaco Editor (VS Code, GitHub, etc.)
  if (
    element.classList.contains("monaco-editor") ||
    element.classList.contains("view-line") ||
    element.closest(".monaco-editor")
  ) {
    return true
  }

  // CodeMirror (many online editors)
  if (
    element.classList.contains("CodeMirror") ||
    element.classList.contains("CodeMirror-line") ||
    element.closest(".CodeMirror")
  ) {
    return true
  }

  // Ace Editor
  if (
    element.classList.contains("ace_editor") ||
    element.classList.contains("ace_text-input") ||
    element.closest(".ace_editor")
  ) {
    return true
  }

  // Lexical (Facebook's rich text editor)
  if (
    element.hasAttribute("data-lexical-editor") ||
    element.closest("[data-lexical-editor]")
  ) {
    return true
  }

  // ProseMirror (used by many WYSIWYG editors)
  if (
    element.classList.contains("ProseMirror") ||
    element.closest(".ProseMirror")
  ) {
    return true
  }

  // Google Docs/Sheets/Slides
  if (
    element.classList.contains("docs-texteventtarget-iframe") ||
    element.classList.contains("kix-page") ||
    element.closest(".kix-appview-editor")
  ) {
    return true
  }

  // Notion
  if (
    element.hasAttribute("data-content-editable-leaf") ||
    element.closest("[data-content-editable-leaf]")
  ) {
    return true
  }

  // Design tools that use canvas but need keyboard input
  if (element.tagName === "canvas") {
    // Check if it's part of an editor interface
    const parent = element.parentElement
    if (
      parent?.classList.contains("editor-canvas") ||
      parent?.classList.contains("design-surface")
    ) {
      return true
    }
  }

  // Elements that might be input-like based on ARIA attributes
  if (
    element.hasAttribute("aria-label") ||
    element.hasAttribute("aria-placeholder")
  ) {
    const tabIndex = element.getAttribute("tabindex")
    const isInteractive = tabIndex !== null && tabIndex !== "-1"
    if (isInteractive) {
      // Additional check for data attributes suggesting input behavior
      if (
        element.hasAttribute("data-slate-node") || // Slate editor
        element.hasAttribute("data-gramm") || // Grammarly
        element.hasAttribute("data-quill") || // Quill editor
        element.hasAttribute("data-medium-editor")
      ) {
        // Medium editor
        return true
      }
    }
  }

  return false
}

/**
 * Check if event has non-shift modifiers (cmd, ctrl, alt)
 * These typically indicate global shortcuts rather than typing
 */
export function hasNonShiftModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey
}

/**
 * Check if the key combination is a common text editing shortcut
 * These should never be captured when in editable elements
 */
export function isTextEditingShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  const hasCmd = event.metaKey || event.ctrlKey

  if (hasCmd) {
    // Common text editing shortcuts
    const textEditKeys = [
      "a", // Select all
      "c", // Copy
      "v", // Paste
      "x", // Cut
      "z", // Undo
      "y", // Redo (Windows/Linux)
      "b", // Bold
      "i", // Italic
      "u", // Underline
      "k", // Insert link (common in editors)
      "e", // Center align
      "l", // Left align
      "r", // Right align
      "j", // Justify
      "backspace", // Delete word
      "delete", // Delete word forward
      "arrowleft", // Move word left
      "arrowright", // Move word right
      "arrowup", // Move to beginning
      "arrowdown", // Move to end
      "home", // Beginning of line
      "end", // End of line
    ]

    if (textEditKeys.includes(key)) {
      return true
    }

    // Cmd/Ctrl + Shift combinations
    if (event.shiftKey) {
      const shiftTextEditKeys = [
        "z", // Redo (Mac)
        "v", // Paste without formatting
        "arrowleft", // Select word left
        "arrowright", // Select word right
        "arrowup", // Select to beginning
        "arrowdown", // Select to end
        "home", // Select to beginning of line
        "end", // Select to end of line
      ]

      if (shiftTextEditKeys.includes(key)) {
        return true
      }
    }
  }

  // Alt/Option key combinations for word navigation
  if (event.altKey) {
    const altKeys = ["arrowleft", "arrowright", "backspace", "delete"]
    if (altKeys.includes(key)) {
      return true
    }
  }

  // Tab for indentation
  if (key === "tab") {
    return true
  }

  // Enter for new lines
  if (key === "enter") {
    return true
  }

  // Escape to potentially exit edit mode
  if (key === "escape") {
    return true
  }

  return false
}

/**
 * Check if event represents common browser shortcuts that should pass through
 * These are everyday commands users expect to work normally
 */
export function isCommonBrowserShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  const hasCmd = event.metaKey || event.ctrlKey

  if (hasCmd && !event.altKey && !event.shiftKey) {
    // Common copy/paste/cut commands
    const commonEditKeys = ["c", "v", "x", "a", "z"]
    if (commonEditKeys.includes(key)) {
      return true
    }

    // Common browser navigation
    const commonNavKeys = ["r", "t", "w", "n", "l", "d", "f", "g", "h"]
    if (commonNavKeys.includes(key)) {
      return true
    }
  }

  // Cmd/Ctrl + Shift combinations
  if (hasCmd && event.shiftKey && !event.altKey) {
    const commonShiftKeys = ["t", "n", "w", "r", "z", "delete"]
    if (commonShiftKeys.includes(key)) {
      return true
    }
  }

  return false
}

/**
 * Check if event represents basic navigation keys without modifiers
 * These should work normally for page scrolling and navigation
 */
export function isBasicNavigationKey(event: KeyboardEvent): boolean {
  // Only handle keys without modifiers (except shift for some cases)
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false
  }

  const key = event.key.toLowerCase()

  // Arrow keys for navigation
  const navigationKeys = [
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "up",
    "down",
    "left",
    "right",
    "pageup",
    "pagedown",
    "home",
    "end",
  ]

  if (navigationKeys.includes(key)) {
    return true
  }

  // Space for scrolling (unless shift is held for shift+space)
  if (key === " " || key === "space") {
    return true
  }

  return false
}

/**
 * Check if event represents a CRITICAL browser shortcut that should NEVER be captured
 * These are system-level or security-critical shortcuts
 */
export function isCriticalBrowserShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()

  // Alt+Tab (window switching) - system level
  if (event.altKey && key === "tab") {
    return true
  }

  // Cmd+Tab on Mac (app switching) - system level
  if (event.metaKey && key === "tab") {
    return true
  }

  // Ctrl+Alt+Delete on Windows - system level
  if (event.ctrlKey && event.altKey && key === "delete") {
    return true
  }

  // F11 (fullscreen) without modifiers - let browser handle
  if (key === "f11" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return true
  }

  // Cmd+Q on Mac (quit app) - critical
  if (event.metaKey && key === "q") {
    return true
  }

  // Let everything else through to be checked against user's keybindings
  // The keybinding system will determine if it should handle or pass through
  return false
}

/**
 * Check if we're inside the command palette or related UI components
 * These events should be handled by the UI, not our global handlers
 */
export function isWithinCommandPalette(element: Element | null): boolean {
  if (!element) return false

  // Check if we're in the extension's shadow DOM root
  // The extension uses id="extension-root" with a shadow DOM
  const extensionRoot = document.getElementById("extension-root")
  if (extensionRoot?.contains(element)) {
    return true
  }

  // Also check if the element IS the extension root itself
  if (element.id === "extension-root") {
    return true
  }

  // Check for CMDK components (main command palette) - for non-shadow DOM cases
  if (element.closest("[cmdk-root]") !== null) {
    return true
  }

  // Check for action menus and submenus
  if (element.closest(".raycast-submenu-overlay") !== null) {
    return true
  }

  // Check for other command palette related elements
  if (element.closest("[data-command-palette]") !== null) {
    return true
  }

  // Check for the content script container classes
  if (element.closest(".content_script") !== null) {
    return true
  }

  if (element.closest(".raycast") !== null) {
    return true
  }

  return false
}

/**
 * Special handling for Enter key in command palette
 */
export function shouldSkipEnterInPalette(
  element: Element | null,
  event: KeyboardEvent,
): boolean {
  if (event.key !== "Enter") return false
  return isWithinCommandPalette(element)
}

/**
 * Check if key is allowed for processing
 * Only allow single characters, Enter, and some special keys
 */
export function isAllowedKey(key: string): boolean {
  // Allow Enter (represented as ↵ in some places)
  if (key === "enter" || key === "↵") {
    return true
  }

  // Allow single characters and numbers
  if (/^[a-z0-9]$/i.test(key)) {
    return true
  }

  // Allow some special navigation keys
  const allowedSpecialKeys = [
    "space",
    "esc",
    "escape",
    "tab",
    "backspace",
    "delete",
    "left",
    "right",
    "up",
    "down",
  ]

  return allowedSpecialKeys.includes(key.toLowerCase())
}

/**
 * Comprehensive check combining all filtering logic
 */
export function shouldProcessKeybinding(event: KeyboardEvent): boolean {
  // Basic capture filtering (includes all our smart logic)
  if (!shouldCapture(event)) {
    return false
  }

  // For keys with modifiers, we're more permissive
  // since they're likely intentional shortcuts
  if (hasNonShiftModifier(event)) {
    return true
  }

  // For keys without modifiers, check if it's in our allowed set
  const keyChar = getKeyChar(event)
  if (!isAllowedKey(keyChar)) {
    return false
  }

  return true
}
