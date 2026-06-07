import { Command, useCommandState } from "cmdk"
import { useEffect, useRef, useState } from "react"
import type { CommandExecutionScope, Suggestion } from "../../../shared/types"
import { useActionLabel } from "../../hooks/useActionLabel"
import { useCommandNavigation } from "../../hooks/useCommandNavigation"
import { useAppSelector } from "../../store/hooks"
import { selectIsCapturing } from "../../store/slices/keybinding.slice"
import type { Page } from "../../store/slices/navigation.slice"
import type { CommandData } from "../../types"
import { CommandNavigationError } from "../CommandNavigationError"
import CopyToClipboardListener from "../Listeners/CopyToClipboardListener"
import NewTabListener from "../Listeners/NewTabListener"
import ScrollListener from "../Listeners/ScrollListener"
import {
  getPrimaryNavigationActionTarget,
  getSuggestionActions,
} from "./actionMenu"
import { CommandActions } from "./CommandActions"
import { CommandFooter } from "./CommandFooter"
import { CommandHeader } from "./CommandHeader"
import { CommandList } from "./CommandList"
import { getDisplayName } from "./CommandName"
import { getPaletteKeyboardCommand } from "./paletteKeyboard"

const getExecutionScope = (page: Page): CommandExecutionScope => ({
  pageId: page.id,
  parentPath: page.parentPath,
  searchValue: page.searchValue,
})

function CommandContent({
  pages,
  currentPage,
  inputRef,
  navigateBack,
  updateSearchValue,
  selectCommand,
  close,
  onOpenActions,
  onCloseActions,
  isLoading = false,
  isActionsOpen = false,
  actionsOpenForSuggestion = null,
}: {
  pages: Page[]
  currentPage: Page
  inputRef: React.RefObject<HTMLInputElement | null>
  navigateBack: () => void
  updateSearchValue: (search: string) => void
  selectCommand: (id: string) => void
  close: () => void
  onOpenActions: (suggestion: Suggestion) => void
  onCloseActions: (force?: boolean) => void
  isLoading?: boolean
  isActionsOpen?: boolean
  actionsOpenForSuggestion?: Suggestion | null
}) {
  const focusedValue = useCommandState((state) => state.value)

  // Find the focused suggestion based on its value
  const focusedSuggestion =
    (currentPage.commands.favorites || []).find(
      (item: Suggestion) => item.id === focusedValue,
    ) ||
    (currentPage.commands.suggestions || []).find(
      (item: Suggestion) => item.id === focusedValue,
    ) ||
    (currentPage.searchResults || []).find(
      (item: Suggestion) => item.id === focusedValue,
    )

  // Close action menu when focused command changes and is different from the one with actions open
  useEffect(() => {
    if (isActionsOpen && actionsOpenForSuggestion) {
      // If there's a focused value and it's different from the one the action menu is open for, close it
      // Also close if there's no focused value (hovering away from commands)
      if (
        (focusedValue && focusedValue !== actionsOpenForSuggestion.id) ||
        !focusedValue
      ) {
        onCloseActions()
      }
    }
  }, [focusedValue, isActionsOpen, actionsOpenForSuggestion, onCloseActions])

  const actionLabel = useActionLabel(currentPage)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const inputElement = e.currentTarget.querySelector(
      "input[cmdk-input]",
    ) as HTMLInputElement
    const search = inputElement?.value || ""
    const keyboardCommand = getPaletteKeyboardCommand({
      key: e.key,
      searchValue: search,
      pageCount: pages.length,
      isActionsOpen,
      focusedSuggestion,
    })

    if (keyboardCommand === "open-actions" && focusedSuggestion) {
      e.preventDefault()
      onOpenActions(focusedSuggestion)
      return
    }

    if (keyboardCommand === "navigate-back") {
      e.preventDefault()
      navigateBack()
      return
    }

    if (keyboardCommand === "close") {
      close()
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <CommandHeader
        pages={pages}
        currentPage={currentPage}
        inputRef={inputRef}
        onNavigateBack={navigateBack}
        onSearchChange={updateSearchValue}
      />
      <CommandList
        currentPage={currentPage}
        onSelect={selectCommand}
        isLoading={isLoading}
      />
      <CommandFooter
        currentPage={currentPage}
        focusedSuggestion={focusedSuggestion}
        actionLabel={actionLabel}
        inputRef={inputRef}
        onSelect={selectCommand}
        onOpenActions={onOpenActions}
      />
    </div>
  )
}

interface Props {
  items: CommandData
  executeCommand: (
    id: string,
    formValues: Record<string, string | string[]>,
    navigateBack?: boolean,
    parentNames?: string[],
    executionScope?: CommandExecutionScope,
  ) => Promise<void>
  close: () => void
  onRefreshCommands: () => void
  autoFocus?: boolean
  isLoading?: boolean
}

export function CommandPalette({
  items,
  executeCommand,
  close,
  onRefreshCommands,
  autoFocus = false,
  isLoading = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [actionsState, setActionsState] = useState<{
    open: boolean
    suggestion: Suggestion | null
  }>({
    open: false,
    suggestion: null,
  })

  const _isCapturing = useAppSelector(selectIsCapturing)

  const {
    pages,
    currentPage,
    updateSearchValue,
    navigateBack,
    selectCommand,
    refreshCurrentPage,
    loading,
    error,
    clearError,
  } = useCommandNavigation(items, inputRef, executeCommand)

  // Focus input when mounted (with delay for new tab context)
  useEffect(() => {
    if (autoFocus) {
      // Add small delay to ensure DOM is ready, especially for new tab
      setTimeout(() => {
        inputRef?.current?.focus()
      }, 100)
    } else {
      inputRef?.current?.focus()
    }
  }, [autoFocus])

  const handleOpenActions = (suggestion: Suggestion) => {
    setActionsState({
      open: true,
      suggestion,
    })
  }

  const handleCloseActions = (force = false) => {
    // Don't close action menu if keybinding capture is active, unless forced
    if (_isCapturing && !force) {
      return
    }

    setActionsState({
      open: false,
      suggestion: null,
    })

    // Refocus the search input after closing the action menu
    setTimeout(() => {
      inputRef?.current?.focus()
    }, 50)
  }

  const handleRefreshForKeybinding = async () => {
    // If on root page, refresh the main commands list
    if (currentPage.id === "root") {
      onRefreshCommands()
    } else {
      // If on child page, refresh the current page
      await refreshCurrentPage()
    }
  }

  const handleActionSelect = async (actionId: string) => {
    const selectedAction = getSuggestionActions(actionsState.suggestion).find(
      (action) => action.id === actionId,
    )
    const navigationTarget = getPrimaryNavigationActionTarget(
      actionsState.suggestion,
      selectedAction,
    )

    if (navigationTarget) {
      handleCloseActions(true)
      await selectCommand(navigationTarget)
      return
    }

    // Execute the action using the same flow as regular commands
    await executeCommand(
      actionId,
      currentPage.formValues || {},
      false,
      undefined,
      getExecutionScope(currentPage),
    )

    // Refresh commands after any action to ensure UI is up to date
    onRefreshCommands()

    // The background stamps generated actions with a typed executionContext;
    // branch on that instead of re-parsing the id prefix taxonomy
    const executionType =
      selectedAction?.type === "action" || selectedAction?.type === "submit"
        ? selectedAction.executionContext?.type
        : undefined

    // Refresh child pages for actions that mutate command visibility/state locally
    if (
      executionType === "favorite" ||
      executionType === "resetKeybinding" ||
      executionType === "hideDomain"
    ) {
      await refreshCurrentPage()
    }

    // For setKeybinding actions, don't close the menu - it will stay open for capture
    if (executionType === "setKeybinding") {
      return // Keep menu open
    }
  }

  return (
    <div className="raycast">
      <CopyToClipboardListener />
      <NewTabListener />
      <ScrollListener />
      {error && (
        <CommandNavigationError error={error} onClearError={clearError} />
      )}
      <>
        {/* Filtering and ranking are background-owned (search-commands).
            cmdk only renders lists and handles keyboard navigation. */}
        <Command shouldFilter={false}>
          <CommandContent
            pages={pages}
            currentPage={currentPage}
            inputRef={inputRef}
            navigateBack={navigateBack}
            updateSearchValue={updateSearchValue}
            selectCommand={selectCommand}
            close={close}
            onOpenActions={handleOpenActions}
            onCloseActions={handleCloseActions}
            isLoading={loading || isLoading}
            isActionsOpen={actionsState.open}
            actionsOpenForSuggestion={actionsState.suggestion}
          />

          {actionsState.suggestion && (
            <CommandActions
              open={actionsState.open}
              selectedValue={getDisplayName(actionsState.suggestion.name)}
              inputRef={inputRef}
              suggestion={actionsState.suggestion}
              onActionSelect={handleActionSelect}
              onClose={handleCloseActions}
              onRefresh={handleRefreshForKeybinding}
            />
          )}
        </Command>
      </>
    </div>
  )
}
