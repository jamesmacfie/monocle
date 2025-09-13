import { Command, useCommandState } from "cmdk"
import { useEffect, useRef, useState } from "react"
import type { Suggestion } from "../../../shared/types"
import { useActionLabel } from "../../hooks/useActionLabel"
import { useCommandNavigation } from "../../hooks/useCommandNavigation"
import { useAppSelector } from "../../store/hooks"
import { selectIsCapturing } from "../../store/slices/keybinding.slice"
import type { Page } from "../../store/slices/navigation.slice"
import type { CommandData } from "../../types/command"
import { CommandNavigationError } from "../CommandNavigationError"
import CopyToClipboardListener from "../Listeners/CopyToClipboardListener"
import NewTabListener from "../Listeners/NewTabListener"
import { CommandActions } from "./CommandActions"
import { CommandFooter } from "./CommandFooter"
import { CommandHeader } from "./CommandHeader"
import { CommandList } from "./CommandList"

// Temporary inline function to avoid import issues
const getDisplayName = (name: string | string[]): string => {
  return Array.isArray(name) ? name[0] : name
}

function CommandContent({
  pages,
  currentPage,
  inputRef,
  navigateBack,
  updateSearchValue,
  selectCommand,
  close,
  executeCommand,
  onOpenActions,
  onCloseActions,
  onRefreshCommands,
  onRefreshCurrentPage,
  deepSearchItems = [],
  onDeepSearchItemsChange,
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
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean,
  ) => Promise<void>
  onOpenActions: (suggestion: Suggestion) => void
  onCloseActions: (force?: boolean) => void
  onRefreshCommands: () => void
  onRefreshCurrentPage: () => void
  deepSearchItems?: Suggestion[]
  onDeepSearchItemsChange?: (items: Suggestion[]) => void
  isLoading?: boolean
  isActionsOpen?: boolean
  actionsOpenForSuggestion?: Suggestion | null
}) {
  const focusedValue = useCommandState((state) => state.value)
  // Track the last key pressed to correlate with focus changes
  const _lastKeyRef = useRef<string | null>(null)

  // Find the focused suggestion based on its value
  const focusedSuggestion =
    (currentPage.commands.favorites || []).find(
      (item: Suggestion) => item.id === focusedValue,
    ) ||
    (currentPage.commands.recents || []).find(
      (item: Suggestion) => item.id === focusedValue,
    ) ||
    (currentPage.commands.suggestions || []).find(
      (item: Suggestion) => item.id === focusedValue,
    ) ||
    deepSearchItems.find((item: Suggestion) => item.id === focusedValue)

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

  // Debug: Log navigation focus changes with last key pressed
  useEffect(() => {
    if (!focusedValue) return
    const key = _lastKeyRef.current
    const display = focusedSuggestion
      ? Array.isArray(focusedSuggestion.name)
        ? focusedSuggestion.name.join(" > ")
        : focusedSuggestion.name
      : focusedValue
    // eslint-disable-next-line no-console
    console.log("[CMDK] Focus", {
      key,
      value: focusedValue,
      type: focusedSuggestion?.type,
      name: display,
    })
  }, [focusedValue, focusedSuggestion])

  const actionLabel = useActionLabel(currentPage)

  const handleActionSelect = async (actionId: string) => {
    // Execute the action using the same flow as regular commands
    await executeCommand(actionId, {}, false) // Don't navigate back for actions

    // Refresh commands after any action to ensure UI is up to date
    onRefreshCommands()

    // If this is a favorite toggle action, also refresh the current page
    // to update the isFavorite flags of nested commands
    if (actionId.startsWith("toggle-favorite-")) {
      await onRefreshCurrentPage()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    _lastKeyRef.current = e.key
    // Debug: log keydown at the container level
    // eslint-disable-next-line no-console
    console.log("[CMDK] KeyDown", e.key)
    // Don't handle keyboard shortcuts if action menu is open
    if (isActionsOpen) {
      return
    }

    // Alt key opens actions if there's a focused suggestion with actions
    if (
      e.key === "Alt" &&
      focusedSuggestion &&
      (focusedSuggestion.type === "action" ||
        focusedSuggestion.type === "group") &&
      focusedSuggestion.actions?.length
    ) {
      e.preventDefault()
      onOpenActions(focusedSuggestion)
      // eslint-disable-next-line no-console
      console.log("[CMDK] Open actions for", focusedSuggestion.id)
      return
    }

    // Escape goes to previous page
    if (e.key === "Escape" && pages.length > 1) {
      e.preventDefault()
      // eslint-disable-next-line no-console
      console.log("[CMDK] Escape: navigateBack")
      navigateBack()
      return
    }

    // If on root and Escape, close
    if (e.key === "Escape" && pages.length === 1) {
      // eslint-disable-next-line no-console
      console.log("[CMDK] Escape: close palette")
      close()
      return
    }

    // Backspace goes to previous page when search is empty
    const inputElement = e.currentTarget.querySelector(
      "input[cmdk-input]",
    ) as HTMLInputElement
    const search = inputElement?.value || ""
    if (e.key === "Backspace" && !search && pages.length > 1) {
      e.preventDefault()
      // eslint-disable-next-line no-console
      console.log("[CMDK] Backspace on empty search: navigateBack")
      navigateBack()
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
        onDeepSearchItemsChange={onDeepSearchItemsChange}
        deepSearchItems={deepSearchItems}
        isLoading={isLoading}
      />
      <CommandFooter
        currentPage={currentPage}
        focusedSuggestion={focusedSuggestion}
        actionLabel={actionLabel}
        inputRef={inputRef}
        onActionSelect={handleActionSelect}
        onOpenActions={onOpenActions}
      />
    </div>
  )
}

interface Props {
  items: CommandData
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean,
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

  const [_deepSearchItems, _setDeepSearchItems] = useState<Suggestion[]>([])

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
    // Execute the action using the same flow as regular commands
    await executeCommand(actionId, {}, false) // Don't navigate back for actions

    // Refresh commands after any action to ensure UI is up to date
    onRefreshCommands()

    // If this is a favorite toggle action, also refresh the current page
    // to update the isFavorite flags of nested commands
    if (actionId.startsWith("toggle-favorite-")) {
      await refreshCurrentPage()
    }

    // If this is a reset keybinding action, refresh to show updated keybinding
    if (actionId.startsWith("reset-keybinding-")) {
      await refreshCurrentPage()
    }

    // For setKeybinding actions, don't close the menu - it will stay open for capture
    if (actionId.startsWith("set-keybinding-")) {
      return // Keep menu open
    }
  }

  return (
    <div className="raycast">
      <CopyToClipboardListener />
      <NewTabListener />
      {error && (
        <CommandNavigationError error={error} onClearError={clearError} />
      )}
      <>
        <Command>
          <CommandContent
            pages={pages}
            currentPage={currentPage}
            inputRef={inputRef}
            navigateBack={navigateBack}
            updateSearchValue={updateSearchValue}
            selectCommand={selectCommand}
            close={close}
            executeCommand={executeCommand}
            onOpenActions={handleOpenActions}
            onCloseActions={handleCloseActions}
            onRefreshCommands={onRefreshCommands}
            onRefreshCurrentPage={refreshCurrentPage}
            deepSearchItems={items.deepSearchItems || []}
            onDeepSearchItemsChange={_setDeepSearchItems}
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
