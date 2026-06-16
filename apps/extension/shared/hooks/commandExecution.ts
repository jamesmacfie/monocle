// Architecture: shared/ pure helpers that translate a selected Suggestion +
// current navigation Page into the arguments for the execute-command flow.
// Kept side-effect-free (no messaging, no Redux) so they're unit-testable and
// shared by useCommandNavigation across both palette modes. See
// docs/execution-and-actions.md.
import type { CommandExecutionScope, Suggestion } from "../../shared/types"
import { getDisplayName } from "../components/Command/CommandName"
import type { Page } from "../store/slices/navigation.slice"

export type CommandExecutionRequest = {
  id: string
  formValues: Record<string, string | string[]>
  shouldNavigateBack: boolean
  parentNames?: string[]
  executionScope?: CommandExecutionScope
}

/**
 * Identify which page the command is being executed from, so the background can
 * re-resolve a dynamic child by its parentPath + searchValue. Root needs no
 * scope (commands are resolved globally) → undefined.
 */
export function getPageExecutionScope(
  currentPage: Page,
): CommandExecutionScope | undefined {
  if (currentPage.id === "root") {
    return undefined
  }

  return {
    pageId: currentPage.id,
    parentPath: currentPage.parentPath,
    searchValue: currentPage.searchValue,
  }
}

export function extractParentNames(
  selectedCommand: Suggestion,
  currentPage: Page,
): string[] | undefined {
  if (currentPage.id !== "root" && currentPage.parent) {
    return [getDisplayName(currentPage.parent.name)]
  }

  if (Array.isArray(selectedCommand.name) && selectedCommand.name.length > 1) {
    return selectedCommand.name.slice(1)
  }

  return undefined
}

/**
 * Assemble the full execute-command request for a selected suggestion: merge
 * the page's inline form values with the suggestion's own executionPayload,
 * carry parent names for breadcrumb labelling, attach the execution scope, and
 * decide whether the palette should navigate back / close afterwards. By
 * default actions/submits close unless they opt into `remainOpenOnSelect`;
 * `forceClose` (Cmd/Ctrl+Enter) overrides that and always closes.
 */
export function buildCommandExecutionRequest(
  selectedCommand: Suggestion,
  currentPage: Page,
  options?: { forceClose?: boolean },
): CommandExecutionRequest {
  const baseShouldNavigateBack =
    selectedCommand.type === "action" || selectedCommand.type === "submit"
      ? !selectedCommand.remainOpenOnSelect
      : true

  // forceClose (Cmd/Ctrl+Enter) closes the palette even for commands that
  // would otherwise stay open via remainOpenOnSelect.
  const shouldNavigateBack = options?.forceClose ? true : baseShouldNavigateBack

  return {
    id: selectedCommand.id,
    formValues: {
      ...(currentPage.formValues || {}),
      ...(selectedCommand.executionPayload || {}),
    },
    shouldNavigateBack,
    parentNames: extractParentNames(selectedCommand, currentPage),
    executionScope: getPageExecutionScope(currentPage),
  }
}

/**
 * Whether to re-fetch commands after execution. The logic is inverted on
 * purpose: a command that closes/navigates back tears down its page anyway, so
 * only commands that STAY open (remainOpenOnSelect) need a refresh to reflect
 * any state they just mutated.
 */
export function shouldRefreshCommandsAfterExecution(
  shouldNavigateBack: boolean,
): boolean {
  return !shouldNavigateBack
}
