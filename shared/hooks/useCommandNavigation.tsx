import type { RefObject } from "react"
import { useEffect, useRef } from "react"
import type { CommandSuggestion, FormField } from "../../types/"
import { getDisplayName } from "../components/Command/CommandName"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import { startCapture } from "../store/slices/keybinding.slice"
import {
  clearError,
  hideUI,
  navigateBack as navigateBackAction,
  navigateToCommand,
  type Page,
  refreshCurrentPage as refreshCurrentPageThunk,
  selectCurrentPage,
  selectError,
  selectInitialCommands,
  selectLoading,
  selectPages,
  selectUI,
  setInitialCommands,
  showUI,
  updateSearchValue as updateSearchValueAction,
} from "../store/slices/navigation.slice"

// Helper function to find a command in the current page's commands or deep search items
function _findCommandInPage(
  page: Page,
  commandId: string,
  deepSearchItems: CommandSuggestion[] = [],
): CommandSuggestion | undefined {
  return (
    (page.commands.favorites || []).find(
      (command) => command.id === commandId,
    ) ||
    (page.commands.recents || []).find((command) => command.id === commandId) ||
    (page.commands.suggestions || []).find(
      (command) => command.id === commandId,
    ) ||
    deepSearchItems.find((command) => command.id === commandId)
  )
}

// Helper function to clear search input
function _clearAndResetSearch(
  inputRef: RefObject<HTMLInputElement>,
  ignoreSearchUpdate: React.MutableRefObject<boolean>,
) {
  // Set flag to prevent the search clear from being saved to page state
  ignoreSearchUpdate.current = true

  const inputElement = inputRef.current
  if (inputElement) {
    inputElement.value = ""
    // Dispatch an input event to trigger CMDK's internal search update
    const event = new Event("input", { bubbles: true })
    inputElement.dispatchEvent(event)

    // Reset flag after a short delay to ensure DOM updates are complete
    setTimeout(() => {
      ignoreSearchUpdate.current = false
    }, 100)
  }
}

// Re-export types for convenience
export type { Page, UI } from "../store/slices/navigation.slice"

/**
 * Helper function to extract parent names for breadcrumb display in recent commands
 */
function extractParentNames(
  selectedCommand: CommandSuggestion,
  currentPage: Page,
): string[] | undefined {
  // For commands on child pages, use the immediate parent name
  if (currentPage.id !== "root" && currentPage.parent) {
    const parentName = getDisplayName(currentPage.parent.name)
    return [parentName]
  }

  // For deep search commands with array names, extract full parent hierarchy
  if (Array.isArray(selectedCommand.name) && selectedCommand.name.length > 1) {
    // Deep search names are: [childName, immediateParent, grandparent, ...]
    return selectedCommand.name.slice(1) // Remove child name, keep all parents
  }

  return undefined
}

/**
 * Redux-based hook that manages navigation through nested command pages with search state
 *
 * This is a replacement for useCommandNavigation that uses Redux Toolkit for state management
 * while maintaining the same interface for seamless migration.
 *
 * Features:
 * - Maintains a stack of pages for navigating nested command hierarchies
 * - Preserves search state when navigating between pages
 * - Prevents duplicate navigation attempts and race conditions
 * - Clears search when navigating to child pages to show all children
 */
export function useCommandNavigation(
  initialCommands: {
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
    deepSearchItems: CommandSuggestion[]
  },
  inputRef: RefObject<HTMLInputElement>,
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean,
    parentNames?: string[],
  ) => Promise<void>,
) {
  const dispatch = useAppDispatch()

  // Redux selectors - subscribe only to what we need
  const pages = useAppSelector(selectPages)
  const ui = useAppSelector(selectUI)
  const storedInitialCommands = useAppSelector(selectInitialCommands)
  const loading = useAppSelector(selectLoading)
  const error = useAppSelector(selectError)
  const currentPage = useAppSelector(selectCurrentPage)

  // Ref flags to prevent various race conditions and loops:
  const ignoreSearchUpdate = useRef(false) // Prevents search updates from being saved during navigation
  const prevPageRef = useRef<string | null>(null) // Tracks page changes for search restoration
  // Note: _isNavigatingRef removed - now using Redux loading state

  // Update Redux store when initialCommands change (e.g., favorites update)
  useEffect(() => {
    dispatch(setInitialCommands(initialCommands))
  }, [initialCommands, dispatch])

  // Restore search state when navigating between pages
  useEffect(() => {
    if (currentPage && prevPageRef.current !== currentPage.id) {
      prevPageRef.current = currentPage.id

      // When returning to a page, restore its previous search value
      const inputElement = inputRef.current
      if (inputElement && inputElement.value !== currentPage.searchValue) {
        ignoreSearchUpdate.current = true

        // Direct DOM manipulation needed because we're syncing with CMDK's internal state
        inputElement.value = currentPage.searchValue
        // Trigger CMDK's internal search update
        const event = new Event("input", { bubbles: true })
        inputElement.dispatchEvent(event)
      }
    }
  }, [currentPage?.id, currentPage?.searchValue, inputRef, currentPage])

  /**
   * Updates the search value for the current page
   * Called by CMDK when user types in search input
   */
  const updateSearchValue = (search: string) => {
    // Skip updating if this was triggered by programmatic navigation (not user input)
    if (ignoreSearchUpdate.current) {
      ignoreSearchUpdate.current = false
      return
    }

    dispatch(updateSearchValueAction(search))
  }

  /**
   * Navigates to a child page by fetching children of the specified command
   * Uses parent path to efficiently locate nested commands in the backend
   */
  const navigateTo = async (id: string) => {
    // Prevent race conditions from multiple clicks/key presses using Redux loading state
    if (loading) {
      return false
    }

    try {
      const result = await dispatch(
        navigateToCommand({
          id,
          currentPage,
          initialCommands: storedInitialCommands,
        }),
      ).unwrap()

      if (result.success) {
        // Clear search input to prevent conflicts
        _clearAndResetSearch(inputRef, ignoreSearchUpdate)
        return true
      }
      return false
    } catch (error) {
      console.error("❌ Error navigating to command:", error)
      return false
    }
  }

  /**
   * Navigates back to the previous page or closes UI forms
   * Restores the previous page's search state
   */
  const navigateBack = () => {
    // If UI form is open, close it and return to command list
    if (ui) {
      dispatch(hideUI())
      // Delay focus to ensure DOM is ready after state update
      setTimeout(() => inputRef.current?.focus(), 0)
      return true
    }

    // Can't go back from root page
    if (pages.length <= 1) return false

    // Get the page we're returning to
    const previousPage = pages[pages.length - 2]
    const previousSearchValue = previousPage.searchValue

    // Prevent the search restoration from triggering page state updates
    ignoreSearchUpdate.current = true

    // Dispatch navigate back action
    dispatch(navigateBackAction())

    // Wait for React to process the state update, then restore search
    setTimeout(() => {
      if (inputRef.current) {
        // Restore the previous page's search value
        inputRef.current.value = previousSearchValue

        // Sync with CMDK's internal state
        const event = new Event("input", { bubbles: true })
        inputRef.current.dispatchEvent(event)

        // Focus and select the search text for easy editing
        inputRef.current.focus()
        inputRef.current.setSelectionRange(0, previousSearchValue.length)
      }

      // Re-enable search state updates
      ignoreSearchUpdate.current = false
    }, 0)

    return true
  }

  /**
   * Handles command selection - navigates to children, shows UI, or executes command
   * Called when user clicks or presses Enter on a command
   */
  const selectCommand = async (id: string) => {
    const selectedCommand = _findCommandInPage(
      currentPage,
      id,
      storedInitialCommands.deepSearchItems,
    )

    if (!selectedCommand) {
      console.error("⚠️ Selected command not found for id:", id)
      return
    }

    // Check for set keybinding action
    if (selectedCommand.executionContext?.type === "setKeybinding") {
      dispatch(startCapture(selectedCommand.executionContext.targetCommandId))
      return // Don't execute normal command flow
    }

    if (selectedCommand.isParentCommand) {
      // Parent command: navigate to its children
      await navigateTo(id)
    } else if (selectedCommand.ui) {
      // UI command: show form for user input
      const displayName = getDisplayName(selectedCommand.name)

      dispatch(
        showUI({
          id: selectedCommand.id,
          name: displayName,
          ui: selectedCommand.ui as FormField[],
          remainOpenOnSelect: selectedCommand.remainOpenOnSelect,
        }),
      )
    } else {
      // Leaf command: execute immediately
      // Pass remainOpenOnSelect flag (defaults to false if not set)
      const shouldNavigateBack = !selectedCommand.remainOpenOnSelect

      // Extract parent context for breadcrumb display in recent commands
      const parentNames = extractParentNames(selectedCommand, currentPage)

      await executeCommand(
        selectedCommand.id,
        {},
        shouldNavigateBack,
        parentNames,
      )
    }
  }

  /**
   * Refreshes the current page's commands by re-fetching them from the backend
   * Used when commands need to be updated (e.g., after favoriting)
   */
  const refreshCurrentPage = async () => {
    // Only refresh if we're on a child page (not root)
    if (currentPage.id === "root") {
      return // Root page is refreshed via setInitialCommands
    }

    try {
      await dispatch(refreshCurrentPageThunk({ currentPage })).unwrap()
    } catch (error) {
      console.error("❌ Error refreshing current page:", error)
    }
  }

  return {
    pages,
    currentPage,
    updateSearchValue,
    navigateTo,
    navigateBack,
    ui,
    selectCommand,
    refreshCurrentPage,
    // Expose loading and error states
    loading,
    error,
    clearError: () => dispatch(clearError()),
  }
}
