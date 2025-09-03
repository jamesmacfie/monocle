import { Command, useCommandState } from "cmdk"
import { useEffect, useRef, useState } from "react"
import type { CommandSuggestion } from "../../../types/"
import { useActionLabel } from "../../hooks/useActionLabel"
import { useCommandNavigationRedux } from "../../hooks/useCommandNavigationRedux"
import type { CommandData, Page } from "../../types/command"
import CommandUI from "../CommandUI"
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
  onRefreshCommands,
  onRefreshCurrentPage,
  deepSearchItems = [],
  onDeepSearchItemsChange,
  isLoading = false,
}: {
  pages: Page[]
  currentPage: Page
  inputRef: React.RefObject<HTMLInputElement>
  navigateBack: () => void
  updateSearchValue: (search: string) => void
  selectCommand: (id: string) => void
  close: () => void
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean,
  ) => Promise<void>
  onOpenActions: (suggestion: CommandSuggestion) => void
  onRefreshCommands: () => void
  onRefreshCurrentPage: () => void
  deepSearchItems?: CommandSuggestion[]
  onDeepSearchItemsChange?: (items: CommandSuggestion[]) => void
  isLoading?: boolean
}) {
  const focusedValue = useCommandState((state) => state.value)

  // Find the focused suggestion based on its value
  const focusedSuggestion =
    (currentPage.commands.favorites || []).find(
      (item: CommandSuggestion) => item.id === focusedValue,
    ) ||
    (currentPage.commands.recents || []).find(
      (item: CommandSuggestion) => item.id === focusedValue,
    ) ||
    (currentPage.commands.suggestions || []).find(
      (item: CommandSuggestion) => item.id === focusedValue,
    ) ||
    deepSearchItems.find((item: CommandSuggestion) => item.id === focusedValue)

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
    // Alt key opens actions if there's a focused suggestion with actions
    if (e.key === "Alt" && focusedSuggestion?.actions?.length) {
      e.preventDefault()
      onOpenActions(focusedSuggestion)
      return
    }

    // Escape goes to previous page
    if (e.key === "Escape" && pages.length > 1) {
      e.preventDefault()
      navigateBack()
      return
    }

    // If on root and Escape, close
    if (e.key === "Escape" && pages.length === 1) {
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
    suggestion: CommandSuggestion | null
  }>({
    open: false,
    suggestion: null,
  })
  const [_deepSearchItems, _setDeepSearchItems] = useState<CommandSuggestion[]>(
    [],
  )

  const {
    pages,
    currentPage,
    updateSearchValue,
    navigateBack,
    ui,
    selectCommand,
    refreshCurrentPage,
  } = useCommandNavigationRedux(items, inputRef, executeCommand)

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

  const handleOpenActions = (suggestion: CommandSuggestion) => {
    setActionsState({
      open: true,
      suggestion,
    })
  }

  const handleCloseActions = () => {
    setActionsState({
      open: false,
      suggestion: null,
    })
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
  }

  return (
    <div className="raycast">
      <CopyToClipboardListener />
      <NewTabListener />
      {ui ? (
        <Command>
          <CommandUI
            currentPage={currentPage}
            ui={ui}
            onBack={navigateBack}
            onEscape={navigateBack}
            onExecute={(id, values) => {
              // Pass remainOpenOnSelect flag (defaults to false if not set)
              const shouldNavigateBack = !ui.remainOpenOnSelect
              return executeCommand(id, values, shouldNavigateBack)
            }}
          />
        </Command>
      ) : (
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
              onRefreshCommands={onRefreshCommands}
              onRefreshCurrentPage={refreshCurrentPage}
              deepSearchItems={items.deepSearchItems || []}
              onDeepSearchItemsChange={_setDeepSearchItems}
              isLoading={isLoading}
            />

            {actionsState.suggestion && (
              <CommandActions
                open={actionsState.open}
                selectedValue={getDisplayName(actionsState.suggestion.name)}
                inputRef={inputRef}
                actions={actionsState.suggestion.actions}
                onActionSelect={handleActionSelect}
                onClose={handleCloseActions}
              />
            )}
          </Command>
        </>
      )}
    </div>
  )
}
