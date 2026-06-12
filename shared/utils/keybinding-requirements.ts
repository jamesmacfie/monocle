// Per-command keybinding requirement validation, shared by the background
// persist/conflict paths and both keybinding capture UIs so the rules and
// messaging live in one place. Operates on canonical keybinding strings
// (see key-normalizer.ts).
import type {
  KeybindingRequirements,
  KeybindingRequirementViolation,
} from "../types/commands"
import { parseKeyStroke, splitKeybindingSequence } from "./key-normalizer"

export type { KeybindingRequirementViolation }

export type KeybindingRequirementResult =
  | { valid: true }
  | {
      valid: false
      violation: KeybindingRequirementViolation
      message: string
    }

const NON_SHIFT_MODIFIERS = new Set(["cmd", "ctrl", "alt"])

export const REQUIRE_NON_SHIFT_MODIFIER_MESSAGE =
  "Every stroke must include ⌘ Cmd, ⌃ Ctrl, or ⌥ Alt (shift alone doesn't count) so the shortcut still works while typing in a text field"

const REQUIRE_NON_SHIFT_MODIFIER_HINT =
  "Must include ⌘, ⌃, or ⌥ — works while typing"

// Validates a canonical keybinding against a command's requirements. An empty
// keybinding (clearing the binding) and absent requirements are always valid.
export function validateKeybindingRequirements(
  keybinding: string,
  requirements: KeybindingRequirements | undefined,
): KeybindingRequirementResult {
  if (!requirements?.requireNonShiftModifier || !keybinding) {
    return { valid: true }
  }

  for (const stroke of splitKeybindingSequence(keybinding)) {
    const parsed = parseKeyStroke(stroke)
    const hasNonShiftModifier =
      parsed?.modifiers.some((modifier) => NON_SHIFT_MODIFIERS.has(modifier)) ??
      false

    // Unparseable strokes (defensive — canonical input should always parse)
    // fail the requirement rather than silently passing.
    if (!parsed || !hasNonShiftModifier) {
      return {
        valid: false,
        violation: "missing-non-shift-modifier",
        message: REQUIRE_NON_SHIFT_MODIFIER_MESSAGE,
      }
    }
  }

  return { valid: true }
}

// One-line proactive hint for capture UIs; null when no requirements apply.
export function describeKeybindingRequirements(
  requirements: KeybindingRequirements | undefined,
): string | null {
  if (requirements?.requireNonShiftModifier) {
    return REQUIRE_NON_SHIFT_MODIFIER_HINT
  }
  return null
}
