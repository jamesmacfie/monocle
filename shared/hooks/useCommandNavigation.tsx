import type { RefObject } from "react"
import { useEffect, useRef } from "react"
import type { CommandExecutionScope, Suggestion } from "../../shared/types"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import { startCapture } from "../store/slices/keybinding.slice"
import {
  clearError,
  clearSearchResults,
  findCommandInPage,
  navigateBack as navigateBackAction,
  navigateToCommand,
  refreshCurrentPage as refreshCurrentPageThunk,
  searchCurrentPage,
  selectCurrentPage,
  selectError,
  selectLoading,
  selectPages,
  setInitialCommands,
  updateSearchValue as updateSearchValueAction,
} from "../store/slices/navigation.slice"
import { buildCommandExecutionRequest } from "./commandExecution"

// Helper function to clear search input
function _clearAndResetSearch(
  inputRef: RefObject<HTMLInputElement | null>,
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
export type { Page } from "../store/slices/navigation.slice"

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
    favorites: Suggestion[]
    suggestions: Suggestion[]
  },
  inputRef: RefObject<HTMLInputElement | null>,
  executeCommand: (
    id: string,
    formValues: Record<string, string | string[]>,
    navigateBack?: boolean,
    parentNames?: string[],
    executionScope?: CommandExecutionScope,
  ) => Promise<void>,
) {
  const dispatch = useAppDispatch()

  // Redux selectors - subscribe only to what we need
  const pages = useAppSelector(selectPages)
  const loading = useAppSelector(selectLoading)
  const error = useAppSelector(selectError)
  const currentPage = useAppSelector(selectCurrentPage)

  // Ref flags to prevent various race conditions and loops:
  const ignoreSearchUpdate = useRef(false) // Prevents search updates from being saved during navigation
  const prevPageRef = useRef<string | null>(null) // Tracks page changes for search restoration
  const searchSeqRef = useRef(0) // Monotonic sequence for search-commands requests
  const currentPageId = currentPage?.id
  const currentPageSearchValue = currentPage?.searchValue ?? ""
  const currentPageParentPathKey = currentPage?.parentPath.join("\u0000") ?? ""
  const currentPageHasDynamicChildren = currentPage?.dynamicChildren === true
  // Form pages bypass search entirely: every row stays visible while typing.
  // Display rows (NoOp empty/error states) intentionally don't trigger this.
  const currentPageIsForm = (currentPage?.commands.suggestions || []).some(
    (suggestion) => suggestion.type === "input" || suggestion.type === "submit",
  )

  // Update Redux store when initialCommands change (e.g., favorites update)
  useEffect(() => {
    dispatch(setInitialCommands(initialCommands))
  }, [initialCommands, dispatch])

  // Restore search state when navigating between pages
  useEffect(() => {
    if (currentPage && prevPageRef.current !== currentPage.id) {
      prevPageRef.current = currentPage.id

      const inputElement = inputRef.current
      if (inputElement && inputElement.value !== currentPage.searchValue) {
        ignoreSearchUpdate.current = true

        // Direct DOM manipulation needed because we're syncing with CMDK's internal state
        inputElement.value = currentPage.searchValue
        const event = new Event("input", { bubbles: true })
        inputElement.dispatchEvent(event)
      }
    }
  }, [currentPage?.id, currentPage?.searchValue, inputRef, currentPage])

  // Debounced refresh for pages that opt into dynamic children
  useEffect(() => {
    if (!currentPageId || !currentPageHasDynamicChildren) return
    const handle = setTimeout(() => {
      // Only refresh if we're not already loading; the thunk guards root pages
      dispatch(
        refreshCurrentPageThunk({
          currentPage: {
            id: currentPageId,
            commands: { favorites: [], suggestions: [] },
            searchValue: currentPageSearchValue,
            parentPath: currentPageParentPathKey
              ? currentPageParentPathKey.split("\u0000")
              : [],
            formValues: {},
            dynamicChildren: currentPageHasDynamicChildren,
          },
        }),
      )
    }, 250)
    return () => clearTimeout(handle)
  }, [
    currentPageId,
    currentPageSearchValue,
    currentPageParentPathKey,
    currentPageHasDynamicChildren,
    dispatch,
  ])

  // Debounced background search for root and child group pages. Keyed on the
  // Redux searchValue so programmatic DOM pokes (back-nav search restoration)
  // don't trigger spurious searches — those are filtered by ignoreSearchUpdate
  // before they reach Redux. search-type pages keep their get-children path
  // and form pages bypass search entirely.
  useEffect(() => {
    if (!currentPageId || currentPageHasDynamicChildren || currentPageIsForm) {
      return
    }

    if (currentPageSearchValue.trim().length === 0) {
      dispatch(clearSearchResults())
      return
    }

    const handle = setTimeout(() => {
      searchSeqRef.current += 1
      dispatch(
        searchCurrentPage({
          pageId: currentPageId,
          parentPath: currentPageParentPathKey
            ? currentPageParentPathKey.split("\u0000")
            : [],
          query: currentPageSearchValue,
          seq: searchSeqRef.current,
        }),
      )
    }, 200)
    return () => clearTimeout(handle)
  }, [
    currentPageId,
    currentPageSearchValue,
    currentPageParentPathKey,
    currentPageHasDynamicChildren,
    dispatch,
    currentPageIsForm,
  ])

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
  const selectCommand = async (
    id: string,
    options?: { forceClose?: boolean },
  ) => {
    const selectedCommand = findCommandInPage(currentPage, id)

    if (!selectedCommand) {
      console.error("⚠️ Selected command not found for id:", id)
      return
    }

    // Inline input/display items are non-executable and should not navigate
    const type = selectedCommand.type
    if (type === "input" || type === "display") {
      return
    }

    // Check for set keybinding action
    if (
      selectedCommand.type === "action" &&
      selectedCommand.executionContext?.type === "setKeybinding"
    ) {
      dispatch(
        startCapture({
          commandId: selectedCommand.executionContext.targetCommandId,
          requirements: selectedCommand.executionContext.requirements,
        }),
      )
      return // Don't execute normal command flow
    }

    if (selectedCommand.type === "group" || selectedCommand.type === "search") {
      // Parent command: navigate to its children
      await navigateTo(id)
    } else {
      // Leaf command: execute immediately
      const request = buildCommandExecutionRequest(
        selectedCommand,
        currentPage,
        options,
      )

      await executeCommand(
        request.id,
        request.formValues,
        request.shouldNavigateBack,
        request.parentNames,
        request.executionScope,
      )

      // Commands that keep the palette open (remainOpenOnSelect) may be
      // state-aware: executing them can change their resolved label/icon
      // (e.g. "Hide Clock" -> "Show Clock"). The current child page holds a
      // frozen suggestion snapshot, so re-fetch it to re-resolve those async
      // values. refreshCurrentPage no-ops on root, which is refreshed
      // separately via fetchCommands/setInitialCommands.
      if (!request.shouldNavigateBack) {
        await refreshCurrentPage()
      }
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
    selectCommand,
    refreshCurrentPage,
    // Expose loading and error states
    loading,
    error,
    clearError: () => dispatch(clearError()),
  }
}
