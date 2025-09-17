/**
 * Converts keyboard events to consistent canonical representations
 */

// Platform detection
export const platform = (() => {
  if (typeof navigator === "undefined") return "Unknown"
  if (navigator.userAgent.indexOf("Mac") !== -1) return "Mac"
  if (navigator.userAgent.indexOf("Linux") !== -1) return "Linux"
  return "Windows"
})()

// Special key mappings from event.key to canonical names
const KEY_NAMES: Record<string, string> = {
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  " ": "space",
  "\n": "enter", // Ctrl+Enter on some systems
  Escape: "esc",
  Tab: "tab",
  Enter: "enter",
  Backspace: "backspace",
  Delete: "delete",
}

// Modifier key detection
const MODIFIER_KEYS = ["Control", "Shift", "Alt", "OS", "AltGraph", "Meta"]

// US keyboard layout translations for event.code handling
const EN_US_TRANSLATIONS: Record<string, [string, string]> = {
  Backquote: ["`", "~"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Backslash: ["\\", "|"],
  IntlBackslash: ["\\", "|"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
  Space: [" ", " "],
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Digit0: ["0", ")"],
}

/**
 * Get the canonical character for a keyboard event
 */
export function getKeyChar(event: KeyboardEvent): string {
  // Don't process modifier-only keys
  if (MODIFIER_KEYS.includes(event.key)) {
    return ""
  }

  let key: string

  // Determine whether to use event.key or event.code
  const canUseEventKey =
    // On macOS, when alt is pressed, event.key gives symbols (e.g., ç for alt+c)
    // Use event.code instead to get the physical key pressed
    !(platform === "Mac" && event.altKey)

  if (canUseEventKey) {
    key = event.key
  } else if (!event.code) {
    key = event.key || "" // Fall back to event.key
  } else if (event.code.slice(0, 6) === "Numpad") {
    // Cannot correctly emulate numpad, fall back to event.key
    key = event.key
  } else {
    // Use event.code for consistent physical key mapping
    key = event.code

    // Convert KeyX to X
    if (key.slice(0, 3) === "Key") {
      key = key.slice(3)
    }

    // Handle special keys and shift combinations
    if (EN_US_TRANSLATIONS[key]) {
      key = event.shiftKey
        ? EN_US_TRANSLATIONS[key][1]
        : EN_US_TRANSLATIONS[key][0]
    } else if (key.length === 1 && !event.shiftKey) {
      key = key.toLowerCase()
    }
  }

  // Handle empty or undefined keys
  if (!key) {
    return ""
  }

  // Map special keys to canonical names
  if (KEY_NAMES[key]) {
    return KEY_NAMES[key]
  }

  // Return single characters as-is (will be processed further)
  if (key.length === 1) {
    return key
  }

  // Convert other keys to lowercase
  return key.toLowerCase()
}

/**
 * Convert a keyboard event to canonical key string representation
 */
export function getKeyString(event: KeyboardEvent): string {
  let keyChar = getKeyChar(event)

  if (!keyChar) {
    return ""
  }

  const modifiers: string[] = []

  // Handle shift for single characters (make uppercase)
  if (event.shiftKey && keyChar.length === 1) {
    keyChar = keyChar.toUpperCase()
  }

  // Add modifiers - use full names to match stored keybindings
  if (event.altKey) modifiers.push("alt")
  if (event.ctrlKey) modifiers.push("ctrl")
  if (event.metaKey) modifiers.push("cmd")
  if (event.shiftKey && keyChar.length > 1) modifiers.push("shift")

  // Build the key string
  if (modifiers.length > 0) {
    keyChar = [...modifiers, keyChar].join("-")
    keyChar = `<${keyChar}>`
  }

  return keyChar
}

/**
 * Normalize a keybinding string to canonical format
 */
export function normalizeKeybinding(keybinding: string): string {
  if (!keybinding) return ""

  // If input is already in canonical format, preserve it
  if (keybinding.startsWith("<") && keybinding.endsWith(">")) {
    return keybinding
  }

  // Convert old Unicode format to canonical
  let normalized = keybinding
    .toLowerCase()
    .replace(/⌘/g, "cmd")
    .replace(/⌥/g, "alt")
    .replace(/⇧/g, "shift")
    .replace(/⌃/g, "ctrl")
    .replace(/↵/g, "enter")
    // Convert shorthand modifiers to full names (for backward compatibility)
    .replace(/<m-/g, "<cmd-")
    .replace(/<a-/g, "<alt-")
    .replace(/<c-/g, "<ctrl-")
    .replace(/<s-/g, "<shift-")

  // Handle multi-stroke keybindings - split by comma and process each stroke
  if (normalized.includes(",")) {
    const strokes = normalized.split(",").map((stroke) => {
      const trimmedStroke = stroke.trim()
      // If stroke is already canonical, preserve it
      if (trimmedStroke.startsWith("<") && trimmedStroke.endsWith(">")) {
        return trimmedStroke
      }
      // Otherwise, normalize whitespace
      return trimmedStroke.replace(/\s+/g, " ").trim()
    })
    normalized = strokes.join(", ")
  } else {
    // Single stroke - if not canonical, normalize whitespace
    if (!(normalized.startsWith("<") && normalized.endsWith(">"))) {
      normalized = normalized.replace(/\s+/g, " ").trim()
    }
  }

  return normalized
}

/**
 * Check if a keyboard event represents a modifier key
 */
export function isModifier(event: KeyboardEvent): boolean {
  return MODIFIER_KEYS.includes(event.key)
}

/**
 * Check if event represents an escape key
 */
export function isEscape(event: KeyboardEvent): boolean {
  // Handle both regular escape and Ctrl+[ (vim-like escape)
  return (
    (event.key === "Escape" && event.keyCode !== 229) || // 229 = IME
    getKeyString(event) === "<c-[>"
  )
}

/**
 * Check if event represents a printable character
 */
export function isPrintable(event: KeyboardEvent): boolean {
  const keyString = getKeyString(event)
  return keyString.length === 1
}

/**
 * Convert canonical key back to display format for UI
 * This maintains some user-friendly symbols for display purposes
 */
export function toDisplayFormat(canonicalKey: string): string {
  if (!canonicalKey) return ""

  // Handle multi-stroke keybindings (e.g., "g g" or "<cmd-k>, <cmd-s>")
  const strokes = canonicalKey.split(/,\s*/)

  const formattedStrokes = strokes.map((stroke) => {
    let formatted = stroke.trim()

    // Convert modifier patterns to symbols
    // Order matters - do longer patterns first
    // Keep modifiers separated with spaces for individual kbd elements
    formatted = formatted
      // Command/Meta key (Mac) with multiple modifiers
      .replace(/<cmd-shift-alt-/gi, "⌘ ⇧ ⌥ ")
      .replace(/<meta-shift-alt-/gi, "⌘ ⇧ ⌥ ")
      .replace(/<cmd-alt-shift-/gi, "⌘ ⌥ ⇧ ")
      .replace(/<meta-alt-shift-/gi, "⌘ ⌥ ⇧ ")
      .replace(/<cmd-shift-/gi, "⌘ ⇧ ")
      .replace(/<meta-shift-/gi, "⌘ ⇧ ")
      .replace(/<m-s-/gi, "⌘ ⇧ ")
      .replace(/<cmd-alt-/gi, "⌘ ⌥ ")
      .replace(/<cmd-option-/gi, "⌘ ⌥ ")
      .replace(/<meta-alt-/gi, "⌘ ⌥ ")
      .replace(/<m-a-/gi, "⌘ ⌥ ")
      .replace(/<cmd-/gi, "⌘ ")
      .replace(/<meta-/gi, "⌘ ")
      .replace(/<m-/gi, "⌘ ")

      // Control key with multiple modifiers
      .replace(/<ctrl-shift-alt-/gi, "⌃ ⇧ ⌥ ")
      .replace(/<c-s-a-/gi, "⌃ ⇧ ⌥ ")
      .replace(/<ctrl-alt-shift-/gi, "⌃ ⌥ ⇧ ")
      .replace(/<c-a-s-/gi, "⌃ ⌥ ⇧ ")
      .replace(/<ctrl-shift-/gi, "⌃ ⇧ ")
      .replace(/<c-s-/gi, "⌃ ⇧ ")
      .replace(/<ctrl-alt-/gi, "⌃ ⌥ ")
      .replace(/<c-a-/gi, "⌃ ⌥ ")
      .replace(/<ctrl-/gi, "⌃ ")
      .replace(/<c-/gi, "⌃ ")

      // Alt/Option key with shift
      .replace(/<alt-shift-/gi, "⌥ ⇧ ")
      .replace(/<option-shift-/gi, "⌥ ⇧ ")
      .replace(/<a-s-/gi, "⌥ ⇧ ")
      .replace(/<alt-/gi, "⌥ ")
      .replace(/<option-/gi, "⌥ ")
      .replace(/<a-/gi, "⌥ ")

      // Shift key (standalone)
      .replace(/<shift-/gi, "⇧ ")
      .replace(/<s-/gi, "⇧ ")

      // Remove any remaining angle brackets
      .replace(/[<>]/g, "")

      // Replace hyphens between non-modifier keys with spaces
      .replace(/-/g, " ")

    // Handle special keys with better display names
    formatted = formatted
      .replace(/\besc\b/gi, "⎋")
      .replace(/\bescape\b/gi, "⎋")
      .replace(/\benter\b/gi, "↵")
      .replace(/\breturn\b/gi, "↵")
      .replace(/\btab\b/gi, "⇥")
      .replace(/\bbackspace\b/gi, "⌫")
      .replace(/\bdelete\b/gi, "⌦")
      .replace(/\bspace\b/gi, "␣")
      .replace(/\bleft\b/gi, "←")
      .replace(/\bright\b/gi, "→")
      .replace(/\bup\b/gi, "↑")
      .replace(/\bdown\b/gi, "↓")
      .replace(/\barrowleft\b/gi, "←")
      .replace(/\barrowright\b/gi, "→")
      .replace(/\barrowup\b/gi, "↑")
      .replace(/\barrowdown\b/gi, "↓")
      .replace(/\bpageup\b/gi, "⇞")
      .replace(/\bpagedown\b/gi, "⇟")
      .replace(/\bhome\b/gi, "↖")
      .replace(/\bend\b/gi, "↘")

    // Clean up any double spaces
    formatted = formatted.replace(/\s+/g, " ").trim()

    // Handle single letters - make them uppercase
    if (formatted.length === 1 && /[a-z]/i.test(formatted)) {
      formatted = formatted.toUpperCase()
    }

    return formatted
  })

  return formattedStrokes.join(", ")
}

/**
 * Platform-specific key normalization
 * Converts ctrl to cmd on Mac, etc.
 */
export function platformNormalize(keyString: string): string {
  if (platform === "Mac") {
    return keyString.replace(/<ctrl-/g, "<cmd-").replace(/<c-/g, "<cmd-")
  }
  return keyString
}
