import type { Suggestion } from "../../../shared/types"
import { canOpenActionMenu } from "./actionMenu"

export type PaletteKeyboardCommand =
  | "open-actions"
  | "navigate-back"
  | "close"
  | "none"

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
