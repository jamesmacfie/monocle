import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import type { CommandSuggestion, FormField } from "../../types/"
import { getDisplayName } from "../components/Command/CommandName"
import { useSendMessage } from "./useSendMessage"

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

// Helper function to clear search input and reset navigation flags
function _clearAndResetSearch(
  inputRef: RefObject<HTMLInputElement>,
  ignoreSearchUpdate: React.MutableRefObject<boolean>,
  isNavigatingRef: React.MutableRefObject<boolean>,
) {
  // Set flag to prevent the search clear from being saved to page state
  ignoreSearchUpdate.current = true

  const inputElement = inputRef.current
  if (inputElement) {
    inputElement.value = ""
    // Dispatch an input event to trigger CMDK's internal search update
    const event = new Event("input", { bubbles: true })
    inputElement.dispatchEvent(event)

    // Reset flags after a short delay to ensure DOM updates are complete
    setTimeout(() => {
      ignoreSearchUpdate.current = false
      isNavigatingRef.current = false
    }, 100)
  } else {
    isNavigatingRef.current = false
  }
}

// Enhanced Page type that includes search value
export type Page = {
  id: string
  commands: {
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
  }
  searchValue: string
  parent?: CommandSuggestion
  parentPath: string[] // Track the path of parent command IDs
}

export type UI = {
  id: string
  name: string
  ui: FormField[]
  remainOpenOnSelect?: boolean
}

/**
 * Hook that manages navigation through nested command pages with search state
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
  ) => Promise<void>,
) {
  const sendMessage = useSendMessage()

  // Stack of navigation pages - current page is always the last one
  const [pages, setPages] = useState<Page[]>([
    { id: "root", commands: initialCommands, searchValue: "", parentPath: [] },
  ])
  const currentPage = pages[pages.length - 1]

  // UI form state for commands that require user input
  const [ui, setUi] = useState<UI | null>(null)

  // Ref flags to prevent various race conditions and loops:
  const ignoreSearchUpdate = useRef(false) // Prevents search updates from being saved during navigation
  const prevPageRef = useRef<string | null>(null) // Tracks page changes for search restoration
  const _isNavigatingRef = useRef(false) // Prevents multiple simultaneous navigation attempts

  // Update root page commands when initialCommands change (e.g., favorites update)
  useEffect(() => {
    setPages((currentPages) => {
      const newPages = [...currentPages]
      newPages[0] = { ...newPages[0], commands: initialCommands }
      return newPages
    })
  }, [initialCommands])

  // Restore search state when navigating between pages
  useEffect(() => {
    if (prevPageRef.current !== currentPage.id) {
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
  }, [currentPage.id, currentPage.searchValue, inputRef])

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

    // Store search value on the current page so it's preserved when navigating
    setPages((currentPages) => {
      const newPages = [...currentPages]
      newPages[newPages.length - 1] = {
        ...newPages[newPages.length - 1],
        searchValue: search,
      }
      return newPages
    })
  }

  /**
   * Navigates to a child page by fetching children of the specified command
   * Uses parent path to efficiently locate nested commands in the backend
   */
  const navigateTo = async (id: string) => {
    // Prevent race conditions from multiple clicks/key presses
    if (_isNavigatingRef.current) {
      return false
    }

    _isNavigatingRef.current = true

    try {
      // Build parent path for backend to efficiently locate the command
      // For root: [] (search top-level), for nested: use accumulated parent IDs
      const parentPath = currentPage.id === "root" ? [] : currentPage.parentPath

      // Request children from background script
      const response = await sendMessage({
        type: "get-children-commands",
        id,
        parentPath, // Enables efficient nested command lookup
      })

      if (response.children && response.children.length > 0) {
        // Store reference to parent command for breadcrumb navigation
        const parentCommand = _findCommandInPage(
          currentPage,
          id,
          initialCommands.deepSearchItems,
        )

        // Build path for the new page (used by future child navigations)
        const newParentPath =
          currentPage.id === "root"
            ? [id] // First level: just this command ID
            : [...currentPage.parentPath, id] // Nested: append to existing path

        // Add new page to navigation stack
        setPages([
          ...pages,
          {
            id,
            commands: {
              favorites: [], // Child pages don't inherit favorites/recents
              recents: [],
              suggestions: response.children, // All children go to suggestions
            },
            searchValue: "", // Always start with empty search to show all children
            parent: parentCommand,
            parentPath: newParentPath,
          },
        ])

        // Clear search input and reset navigation flags to prevent conflicts
        _clearAndResetSearch(inputRef, ignoreSearchUpdate, _isNavigatingRef)
        return true
      } else {
        _isNavigatingRef.current = false
      }
      return false
    } catch (error) {
      console.error("❌ Error fetching command children:", error)
      _isNavigatingRef.current = false
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
      setUi(null)
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

    // Pop current page from navigation stack
    setPages(pages.slice(0, -1))

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
      initialCommands.deepSearchItems,
    )

    if (!selectedCommand) {
      console.error("⚠️ Selected command not found for id:", id)
      return
    }

    if (selectedCommand.isParentCommand) {
      // Parent command: navigate to its children
      await navigateTo(id)
    } else if (selectedCommand.ui) {
      // UI command: show form for user input
      const displayName = getDisplayName(selectedCommand.name)

      setUi({
        id: selectedCommand.id,
        name: displayName,
        ui: selectedCommand.ui as FormField[],
        remainOpenOnSelect: selectedCommand.remainOpenOnSelect,
      })
    } else {
      // Leaf command: execute immediately
      // Pass remainOpenOnSelect flag (defaults to false if not set)
      const shouldNavigateBack = !selectedCommand.remainOpenOnSelect
      await executeCommand(selectedCommand.id, {}, shouldNavigateBack)
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
  }
}
