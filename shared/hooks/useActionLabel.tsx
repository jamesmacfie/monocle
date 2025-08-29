import { useCommandState } from "cmdk"
import { getDisplayName } from "../components/Command/CommandName"
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
      (item) => getDisplayName(item.name) === focusedValue,
    ) ||
    (currentPage.commands.recents || []).find(
      (item) => getDisplayName(item.name) === focusedValue,
    ) ||
    (currentPage.commands.suggestions || []).find(
      (item) => getDisplayName(item.name) === focusedValue,
    )

  if (!focusedSuggestion) {
    return defaultLabel
  }

  if (!modifier) {
    return focusedSuggestion.actionLabel || defaultLabel
  }

  if (focusedSuggestion.modifierActionLabel?.[modifier]) {
    return focusedSuggestion.modifierActionLabel[modifier] || defaultLabel
  }

  return defaultLabel
}
