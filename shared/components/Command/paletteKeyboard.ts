// Pure key-interpretation state machine for the palette body. Translates a raw
// keydown (key + current search/page state) into a single high-level intent so
// CommandContent stays declarative and this logic is unit-testable in isolation.
// Kept separate from cmdk's own arrow/Enter handling. See
// docs/palette-ui-and-navigation.md.
import type { Suggestion } from "../../../shared/types"
import { canOpenActionMenu } from "./actionMenu"

export type PaletteKeyboardCommand =
  | "open-actions"
  | "navigate-back"
  | "close"
  | "none"

/**
 * Resolve a keydown to a palette intent. Rules, in priority order:
 * - When the action menu is open, the palette yields all keys to it → "none".
 * - Alt opens the action menu, but only for suggestions that have actions
 *   (canOpenActionMenu).
 * - Escape goes back one page when nested (pageCount > 1), otherwise closes.
 * - Backspace goes back only when the search box is empty AND nested — so it
 *   still edits text mid-query and never closes the palette outright.
 * Anything else is "none" and falls through to cmdk / the input.
 */
export function getPaletteKeyboardCommand({
  key,
  searchValue,
  pageCount,
  isActionsOpen,
  focusedSuggestion,
}: {
  key: string
  searchValue: string
  pageCount: number
  isActionsOpen: boolean
  focusedSuggestion?: Suggestion
}): PaletteKeyboardCommand {
  if (isActionsOpen) {
    return "none"
  }

  if (key === "Alt" && canOpenActionMenu(focusedSuggestion)) {
    return "open-actions"
  }

  if (key === "Escape" && pageCount > 1) {
    return "navigate-back"
  }

  if (key === "Escape") {
    return "close"
  }

  if (key === "Backspace" && !searchValue && pageCount > 1) {
    return "navigate-back"
  }

  return "none"
}
