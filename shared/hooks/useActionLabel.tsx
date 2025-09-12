import { useCommandState } from "cmdk"
import type { Page } from "./useCommandNavigation"
import { useIsModifierKeyPressed } from "./useIsModifierKeyPressed"

export function useActionLabel(
  currentPage: Page,
  defaultLabel = "Run",
): string {
  const { modifier } = useIsModifierKeyPressed()
  const focusedValue = useCommandState((state) => state.value)
  const focusedSuggestion =
    (currentPage.commands.favorites || []).find(
      (item) => item.id === focusedValue,
    ) ||
    (currentPage.commands.recents || []).find(
      (item) => item.id === focusedValue,
    ) ||
    (currentPage.commands.suggestions || []).find(
      (item) => item.id === focusedValue,
    )

  if (!focusedSuggestion) {
    return defaultLabel
  }

  const type = focusedSuggestion.type
  if (type === "input" || type === "display") {
    return ""
  }

  if (!modifier) {
    return focusedSuggestion.actionLabel || defaultLabel
  }

  if (focusedSuggestion.modifierActionLabel?.[modifier]) {
    return focusedSuggestion.modifierActionLabel[modifier] || defaultLabel
  }

  return defaultLabel
}
