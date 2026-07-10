// Architecture: shared palette command execution. Pure helpers translate a
// selected Suggestion + navigation Page into an execution request; the shared
// hook owns the send/refresh/close lifecycle used by both palette shells.
import { useCallback } from "react"
import type {
  CommandExecutionScope,
  ExecuteCommandMessage,
  Suggestion,
} from "../../shared/types"
import { getDisplayName } from "../components/Command/CommandName"
import type { Page } from "../store/slices/navigation.slice"

export type CommandExecutionRequest = {
  id: string
  formValues: Record<string, string | string[]>
  shouldNavigateBack: boolean
  parentNames?: string[]
  executionScope?: CommandExecutionScope
}

export type ExecuteCommandMessageWithoutContext = Omit<
  ExecuteCommandMessage,
  "context"
>

export function useExecuteCommand(options: {
  sendMessage: (
    message: ExecuteCommandMessageWithoutContext,
  ) => Promise<{ success?: boolean } | undefined>
  refreshCommands: () => Promise<unknown> | unknown
  onClose?: () => void
  alwaysRefreshAfterSuccess?: boolean
  logPrefix: string
}): (
  id: string,
  formValues: Record<string, string | string[]>,
  navigateBack?: boolean,
  parentNames?: string[],
  executionScope?: CommandExecutionScope,
) => Promise<void> {
  const {
    sendMessage,
    refreshCommands,
    onClose,
    alwaysRefreshAfterSuccess = false,
    logPrefix,
  } = options

  return useCallback(
    async (
      id,
      formValues,
      navigateBack = true,
      parentNames,
      executionScope,
    ) => {
      try {
        const response = await sendMessage({
          type: "monocle-command-execute",
          id,
          formValues,
          parentNames,
          executionScope,
        })

        if (!response?.success) {
          return
        }

        if (
          alwaysRefreshAfterSuccess ||
          shouldRefreshCommandsAfterExecution(navigateBack)
        ) {
          await refreshCommands()
        }

        if (navigateBack) {
          onClose?.()
        }
      } catch (error) {
        console.error(`[${logPrefix}] Error sending execute message:`, error)
      }
    },
    [
      alwaysRefreshAfterSuccess,
      logPrefix,
      onClose,
      refreshCommands,
      sendMessage,
    ],
  )
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
