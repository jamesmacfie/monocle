import type { Suggestion } from "../../../shared/types"

type SuggestionWithActions = Extract<
  Suggestion,
  { type: "action" | "submit" | "search" | "group" }
>

export function getSuggestionActions(
  suggestion: Suggestion | null | undefined,
): Suggestion[] {
  if (
    !suggestion ||
    (suggestion.type !== "action" &&
      suggestion.type !== "submit" &&
      suggestion.type !== "search" &&
      suggestion.type !== "group")
  ) {
    return []
  }

  return suggestion.actions || []
}

export function canOpenActionMenu(
  suggestion: Suggestion | null | undefined,
): suggestion is SuggestionWithActions {
  return getSuggestionActions(suggestion).length > 0
}

export function getPrimaryNavigationActionTarget(
  source: Suggestion | null | undefined,
  action: Suggestion | null | undefined,
): string | null {
  if (!source || !action || action.type !== "action") {
    return null
  }

  if (source.type !== "group" && source.type !== "search") {
    return null
  }

  if (action.executionContext?.type !== "primary") {
    return null
  }

  return action.executionContext.targetCommandId
}
