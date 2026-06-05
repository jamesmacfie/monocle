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

export function buildCommandExecutionRequest(
  selectedCommand: Suggestion,
  currentPage: Page,
): CommandExecutionRequest {
  const shouldNavigateBack =
    selectedCommand.type === "action" || selectedCommand.type === "submit"
      ? !selectedCommand.remainOpenOnSelect
      : true

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

export function shouldRefreshCommandsAfterExecution(
  shouldNavigateBack: boolean,
): boolean {
  return !shouldNavigateBack
}
