/**
 * Canonical keybinding strings. Every keybinding — captured from an event,
 * authored in a command, or persisted in settings — is reduced to ONE textual
 * form so capture, storage, registry matching, and display all compare equal.
 *
 * Canonical form:
 * - Single stroke with modifiers: angle-bracketed, modifiers in fixed order
 *   (cmd, ctrl, alt, shift) then the primary key, e.g. `<cmd-shift-k>`.
 * - Plain key with no modifiers: the bare key, e.g. `g`, `escape`, `space`.
 * - Sequence (chord): canonical strokes joined by `, `, e.g. `g, g` or
 *   `<cmd-k>, <cmd-s>`.
 *
 * Primary keys are derived from event.code where possible (layout-independent)
 * and lower-cased; shifted symbols are folded to their base key + the shift
 * modifier (`!` → `<shift-1>`). This module is the single source of truth for
 * that mapping. See docs/keybindings.md.
 */

export const platform = (() => {
  if (typeof navigator === "undefined") return "Unknown"
  if (navigator.userAgent.indexOf("Mac") !== -1) return "Mac"
  if (navigator.userAgent.indexOf("Linux") !== -1) return "Linux"
  return "Windows"
})()

export type ModifierName = "cmd" | "ctrl" | "alt" | "shift"

export type KeyStroke = {
  modifiers: ModifierName[]
  key: string
}

export const MODIFIER_ORDER: ModifierName[] = ["cmd", "ctrl", "alt", "shift"]

const MODIFIER_ALIASES: Record<string, ModifierName> = {
  a: "alt",
  alt: "alt",
  c: "ctrl",
  cmd: "cmd",
  command: "cmd",
  control: "ctrl",
  ctrl: "ctrl",
  m: "cmd",
  meta: "cmd",
  mod: "cmd",
  opt: "alt",
  option: "alt",
  s: "shift",
  shift: "shift",
}

const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "OS",
  "Shift",
])

const SPECIAL_KEY_ALIASES: Record<string, string> = {
  " ": "space",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  backspace: "backspace",
  del: "delete",
  delete: "delete",
  down: "down",
  end: "end",
  enter: "enter",
  esc: "escape",
  escape: "escape",
  home: "home",
  insert: "insert",
  left: "left",
  pagedown: "pagedown",
  pageup: "pageup",
  return: "enter",
  right: "right",
  space: "space",
  spacebar: "space",
  tab: "tab",
  up: "up",
}

const DISPLAY_KEY_ALIASES: Record<string, string> = {
  "⌫": "backspace",
  "⌦": "delete",
  "⎋": "escape",
  "␣": "space",
  "↵": "enter",
  "⇞": "pageup",
  "⇟": "pagedown",
  "⇥": "tab",
  "←": "left",
  "↑": "up",
  "→": "right",
  "↓": "down",
  "↖": "home",
  "↘": "end",
}

const CODE_KEY_ALIASES: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  IntlBackslash: "\\",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "space",
}

const SPECIAL_CODE_ALIASES: Record<string, string> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  Backspace: "backspace",
  Delete: "delete",
  End: "end",
  Enter: "enter",
  Escape: "escape",
  Home: "home",
  Insert: "insert",
  PageDown: "pagedown",
  PageUp: "pageup",
  Tab: "tab",
}

const SHIFTED_SYMBOL_ALIASES: Record<string, string> = {
  "!": "1",
  '"': "'",
  "#": "3",
  $: "4",
  "%": "5",
  "&": "7",
  "(": "9",
  ")": "0",
  "*": "8",
  "+": "=",
  ":": ";",
  "<": ",",
  ">": ".",
  "?": "/",
  "@": "2",
  "^": "6",
  _: "-",
  "{": "[",
  "|": "\\",
  "}": "]",
  "~": "`",
}

const PRIMARY_DISPLAY: Record<string, string> = {
  backspace: "⌫",
  delete: "⌦",
  down: "↓",
  end: "↘",
  enter: "↵",
  escape: "⎋",
  home: "↖",
  left: "←",
  pagedown: "⇟",
  pageup: "⇞",
  right: "→",
  space: "␣",
  tab: "⇥",
  up: "↑",
}

const MODIFIER_DISPLAY: Record<ModifierName, string> = {
  alt: "⌥",
  cmd: "⌘",
  ctrl: "⌃",
  shift: "⇧",
}

const modifierAliasesByLength = Object.keys(MODIFIER_ALIASES).sort(
  (a, b) => b.length - a.length,
)

const sortModifiers = (modifiers: Iterable<ModifierName>): ModifierName[] => {
  const modifierSet = new Set(modifiers)
  return MODIFIER_ORDER.filter((modifier) => modifierSet.has(modifier))
}

const normalizeModifier = (value: string): ModifierName | undefined => {
  return MODIFIER_ALIASES[value.trim().toLowerCase()]
}

const isModifierName = (value: string): boolean => {
  return normalizeModifier(value) !== undefined
}

const normalizePrimaryKey = (
  rawPrimary: string,
): { key: string; modifiers: ModifierName[] } | null => {
  const trimmed = rawPrimary === " " ? " " : rawPrimary.trim()
  if (!trimmed) return null

  const displayAlias = DISPLAY_KEY_ALIASES[trimmed]
  if (displayAlias) {
    return { key: displayAlias, modifiers: [] }
  }

  const lower = trimmed.toLowerCase()

  if (trimmed.length > 1 && isModifierName(lower)) {
    return null
  }

  const specialAlias = SPECIAL_KEY_ALIASES[lower]
  if (specialAlias) {
    return { key: specialAlias, modifiers: [] }
  }

  if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) {
    return { key: lower, modifiers: [] }
  }

  const shiftedBase = SHIFTED_SYMBOL_ALIASES[trimmed]
  if (shiftedBase) {
    return { key: shiftedBase, modifiers: ["shift"] }
  }

  if (trimmed.length === 1) {
    return { key: trimmed.toLowerCase(), modifiers: [] }
  }

  if (/^[a-z][a-z0-9]*$/.test(lower)) {
    return { key: lower, modifiers: [] }
  }

  return null
}

const formatKeyStroke = ({ modifiers, key }: KeyStroke): string => {
  const sortedModifiers = sortModifiers(modifiers)
  if (sortedModifiers.length === 0) {
    return key
  }

  return `<${[...sortedModifiers, key].join("-")}>`
}

const startsWithModifierPrefix = (value: string): boolean => {
  const lower = value.toLowerCase()
  return modifierAliasesByLength.some((alias) => lower.startsWith(`${alias}-`))
}

const parseDashedStroke = (input: string): KeyStroke | null => {
  let remaining = input.trim()
  const modifiers: ModifierName[] = []

  while (remaining) {
    const lowerRemaining = remaining.toLowerCase()
    const alias = modifierAliasesByLength.find((candidate) =>
      lowerRemaining.startsWith(`${candidate}-`),
    )

    if (!alias) break

    modifiers.push(MODIFIER_ALIASES[alias])
    remaining = remaining.slice(alias.length + 1)
  }

  const primary = normalizePrimaryKey(remaining)
  if (!primary) return null

  return {
    key: primary.key,
    modifiers: sortModifiers([...modifiers, ...primary.modifiers]),
  }
}

const parseTokenizedStroke = (input: string): KeyStroke | null => {
  const tokens = input
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) return null

  const modifiers: ModifierName[] = []

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const modifier = normalizeModifier(tokens[index])
    if (!modifier) return null
    modifiers.push(modifier)
  }

  const primary = normalizePrimaryKey(tokens[tokens.length - 1])
  if (!primary) return null

  return {
    key: primary.key,
    modifiers: sortModifiers([...modifiers, ...primary.modifiers]),
  }
}

/**
 * Parse one stroke (not a sequence) into its modifiers + primary key. Accepts
 * all the forms the codebase has historically produced: canonical
 * `<cmd-shift-k>`, legacy display glyphs (`⌘ K`), space-tokenized, and bare
 * keys. Returns null for anything that isn't a valid single stroke.
 */
export const parseKeyStroke = (stroke: string): KeyStroke | null => {
  const trimmed = stroke.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return parseDashedStroke(trimmed.slice(1, -1))
  }

  const legacyDisplayStroke = trimmed
    .replace(/⌘/g, " cmd ")
    .replace(/⌃/g, " ctrl ")
    .replace(/⌥/g, " alt ")
    .replace(/⇧/g, " shift ")
    .replace(/\s+/g, " ")
    .trim()

  if (legacyDisplayStroke.includes(" ")) {
    return parseTokenizedStroke(legacyDisplayStroke)
  }

  if (startsWithModifierPrefix(legacyDisplayStroke)) {
    return parseDashedStroke(legacyDisplayStroke)
  }

  const primary = normalizePrimaryKey(legacyDisplayStroke)
  if (!primary) return null

  return {
    key: primary.key,
    modifiers: sortModifiers(primary.modifiers),
  }
}

/**
 * Split a sequence string into its individual stroke strings on top-level
 * commas, tracking angle-bracket depth so a comma inside `<...>` is never a
 * separator. The literal `,` key is handled as a special case so a comma can
 * itself be a bound key.
 */
export const splitKeybindingSequence = (keybinding: string): string[] => {
  const trimmed = keybinding.trim()
  if (!trimmed) return []
  if (trimmed === ",") return [","]

  const strokes: string[] = []
  let current = ""
  let angleDepth = 0

  for (const character of trimmed) {
    if (character === "<") {
      angleDepth += 1
    } else if (character === ">") {
      angleDepth = Math.max(0, angleDepth - 1)
    }

    if (character === "," && angleDepth === 0) {
      if (current.trim()) {
        strokes.push(current.trim())
        current = ""
      } else {
        current += character
      }
      continue
    }

    current += character
  }

  if (current.trim()) {
    strokes.push(current.trim())
  }

  return strokes.length > 0 ? strokes : [trimmed]
}

/**
 * Reduce any keybinding string (single or sequence, any accepted input form) to
 * its canonical form. Returns "" if any stroke fails to parse — callers treat
 * "" as "invalid keybinding" (see isValidKeybinding). This is the function to
 * call before storing or comparing a keybinding.
 */
export function normalizeKeybinding(keybinding: string): string {
  if (!keybinding) return ""

  const strokes = splitKeybindingSequence(keybinding)
  if (strokes.length === 0) return ""

  const normalizedStrokes: string[] = []

  for (const stroke of strokes) {
    const parsedStroke = parseKeyStroke(stroke)
    if (!parsedStroke) return ""
    normalizedStrokes.push(formatKeyStroke(parsedStroke))
  }

  return normalizedStrokes.join(", ")
}

export function isValidKeybinding(keybinding: string): boolean {
  return normalizeKeybinding(keybinding) !== ""
}

const getPrimaryFromCode = (event: KeyboardEvent) => {
  const { code } = event
  if (!code) return null

  if (code.startsWith("Key") && code.length === 4) {
    return { key: code.slice(3).toLowerCase(), modifiers: [] }
  }

  if (code.startsWith("Digit") && code.length === 6) {
    return { key: code.slice(5), modifiers: [] }
  }

  if (CODE_KEY_ALIASES[code]) {
    return { key: CODE_KEY_ALIASES[code], modifiers: [] }
  }

  if (SPECIAL_CODE_ALIASES[code]) {
    return { key: SPECIAL_CODE_ALIASES[code], modifiers: [] }
  }

  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) {
    return { key: code.toLowerCase(), modifiers: [] }
  }

  return null
}

const getPrimaryFromEvent = (event: KeyboardEvent) => {
  const codePrimary = getPrimaryFromCode(event)
  if (codePrimary) return codePrimary

  return normalizePrimaryKey(event.key || "")
}

export function getKeyChar(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) {
    return ""
  }

  return getPrimaryFromEvent(event)?.key ?? ""
}

/**
 * Convert a live KeyboardEvent into a canonical single-stroke string (the
 * capture path). Returns "" while only a modifier is held (so capture waits for
 * a real key). Prefers event.code for the primary key (layout-independent) and
 * folds the event's active modifier flags into canonical order.
 */
export function getKeyString(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) {
    return ""
  }

  const primary = getPrimaryFromEvent(event)
  if (!primary) return ""

  const modifiers: ModifierName[] = [...primary.modifiers]
  if (event.metaKey) modifiers.push("cmd")
  if (event.ctrlKey) modifiers.push("ctrl")
  if (event.altKey) modifiers.push("alt")
  if (event.shiftKey) modifiers.push("shift")

  return formatKeyStroke({
    key: primary.key,
    modifiers: sortModifiers(modifiers),
  })
}

export function isModifier(event: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(event.key)
}

export function isEscape(event: KeyboardEvent): boolean {
  return (
    (event.key === "Escape" && event.keyCode !== 229) ||
    getKeyString(event) === "<ctrl-[>"
  )
}

export function isPrintable(event: KeyboardEvent): boolean {
  const keyString = getKeyString(event)
  return keyString.length === 1
}

export function toDisplayFormat(canonicalKey: string): string {
  if (!canonicalKey) return ""

  const normalizedKeybinding = normalizeKeybinding(canonicalKey)
  if (!normalizedKeybinding) return canonicalKey

  return splitKeybindingSequence(normalizedKeybinding)
    .map((stroke) => {
      const parsedStroke = parseKeyStroke(stroke)
      if (!parsedStroke) return stroke

      const modifierParts = parsedStroke.modifiers.map(
        (modifier) => MODIFIER_DISPLAY[modifier],
      )
      const primaryPart =
        PRIMARY_DISPLAY[parsedStroke.key] ??
        (/^[a-z]$/.test(parsedStroke.key)
          ? parsedStroke.key.toUpperCase()
          : parsedStroke.key)

      return [...modifierParts, primaryPart].join(" ")
    })
    .join(", ")
}

export function platformNormalize(keyString: string): string {
  const normalized = normalizeKeybinding(keyString)
  if (!normalized || platform !== "Mac") {
    return normalized
  }

  const strokes = splitKeybindingSequence(normalized)
    .map((stroke) => {
      const parsedStroke = parseKeyStroke(stroke)
      if (!parsedStroke) return stroke

      const modifiers = parsedStroke.modifiers.map((modifier) =>
        modifier === "ctrl" ? "cmd" : modifier,
      )

      return formatKeyStroke({
        key: parsedStroke.key,
        modifiers: sortModifiers(modifiers),
      })
    })
    .join(", ")

  return strokes
}
