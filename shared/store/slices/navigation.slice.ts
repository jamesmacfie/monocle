import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit"
import type { CommandSuggestion, FormField } from "../../../types"
import type { ThunkApi } from "../index"

// Types from original hook
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

// State shape
interface NavigationState {
  pages: Page[]
  ui: UI | null
  // Keep initial commands for root page updates and deep search
  initialCommands: {
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
    deepSearchItems: CommandSuggestion[]
  }
  loading: boolean
  error: string | null
}

// Helper function to find a command in the current page's commands or deep search items
function findCommandInPage(
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

// Async thunks
export const navigateToCommand = createAsyncThunk<
  {
    success: boolean
    newPage?: Page
  },
  {
    id: string
    currentPage: Page
    initialCommands: NavigationState["initialCommands"]
  },
  { extra: ThunkApi }
>(
  "navigation/navigateToCommand",
  async ({ id, currentPage, initialCommands }, { extra, rejectWithValue }) => {
    try {
      // Build parent path for backend to efficiently locate the command
      const parentPath = currentPage.id === "root" ? [] : currentPage.parentPath

      // Request children from background script
      const response = await extra.sendMessage({
        type: "get-children-commands",
        id,
        parentPath,
      })

      if (response.children && response.children.length > 0) {
        // Store reference to parent command for breadcrumb navigation
        const parentCommand = findCommandInPage(
          currentPage,
          id,
          initialCommands.deepSearchItems,
        )

        // Build path for the new page (used by future child navigations)
        const newParentPath =
          currentPage.id === "root"
            ? [id] // First level: just this command ID
            : [...currentPage.parentPath, id] // Nested: append to existing path

        // Create new page
        const newPage: Page = {
          id,
          commands: {
            favorites: [], // Child pages don't inherit favorites/recents
            recents: [],
            suggestions: response.children, // All children go to suggestions
          },
          searchValue: "", // Always start with empty search to show all children
          parent: parentCommand,
          parentPath: newParentPath,
        }

        return { success: true, newPage }
      }

      return { success: false }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to navigate to command"
      console.error("❌ Error fetching command children:", error)
      return rejectWithValue(errorMessage)
    }
  },
)

export const refreshCurrentPage = createAsyncThunk<
  {
    success: boolean
    newCommands?: {
      favorites: CommandSuggestion[]
      recents: CommandSuggestion[]
      suggestions: CommandSuggestion[]
    }
  },
  { currentPage: Page },
  { extra: ThunkApi }
>(
  "navigation/refreshCurrentPage",
  async ({ currentPage }, { extra, rejectWithValue }) => {
    // Only refresh if we're on a child page (not root)
    if (currentPage.id === "root") {
      return { success: false } // Root page is refreshed via setInitialCommands
    }

    try {
      // Re-fetch children for the current parent command
      const parentPath = currentPage.parentPath.slice(0, -1) // Remove current page ID to get parent path
      const response = await extra.sendMessage({
        type: "get-children-commands",
        id: currentPage.id,
        parentPath,
      })

      if (response.children) {
        return {
          success: true,
          newCommands: {
            favorites: [],
            recents: [],
            suggestions: response.children,
          },
        }
      }

      return { success: false }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to refresh current page"
      console.error("❌ Error refreshing current page:", error)
      return rejectWithValue(errorMessage)
    }
  },
)

// Create slice
export const navigationSlice = createSlice({
  name: "navigation",
  initialState: (
    initialCommands?: NavigationState["initialCommands"],
  ): NavigationState => ({
    pages: initialCommands
      ? [
          {
            id: "root",
            commands: initialCommands,
            searchValue: "",
            parentPath: [],
          },
        ]
      : [],
    ui: null,
    initialCommands: initialCommands || {
      favorites: [],
      recents: [],
      suggestions: [],
      deepSearchItems: [],
    },
    loading: false,
    error: null,
  }),
  reducers: {
    // Update root page commands when initialCommands change (e.g., favorites update)
    setInitialCommands: (
      state,
      action: PayloadAction<NavigationState["initialCommands"]>,
    ) => {
      state.initialCommands = action.payload
      // Update root page
      if (state.pages.length > 0) {
        state.pages[0] = { ...state.pages[0], commands: action.payload }
      } else {
        state.pages = [
          {
            id: "root",
            commands: action.payload,
            searchValue: "",
            parentPath: [],
          },
        ]
      }
    },

    // Update search value for current page
    updateSearchValue: (state, action: PayloadAction<string>) => {
      if (state.pages.length > 0) {
        const currentPageIndex = state.pages.length - 1
        state.pages[currentPageIndex] = {
          ...state.pages[currentPageIndex],
          searchValue: action.payload,
        }
      }
    },

    // Navigate back to previous page or close UI
    navigateBack: (state) => {
      // If UI form is open, close it
      if (state.ui) {
        state.ui = null
        return
      }

      // Can't go back from root page
      if (state.pages.length <= 1) return

      // Pop current page from navigation stack
      state.pages = state.pages.slice(0, -1)
    },

    // Show UI form for commands that require input
    showUI: (state, action: PayloadAction<UI>) => {
      state.ui = action.payload
    },

    // Hide UI form
    hideUI: (state) => {
      state.ui = null
    },

    // Clear error state
    clearError: (state) => {
      state.error = null
    },

    // Add new page to navigation stack (used by successful navigateToCommand)
    addPage: (state, action: PayloadAction<Page>) => {
      state.pages.push(action.payload)
    },

    // Update current page's commands (used by successful refreshCurrentPage)
    updateCurrentPageCommands: (
      state,
      action: PayloadAction<{
        favorites: CommandSuggestion[]
        recents: CommandSuggestion[]
        suggestions: CommandSuggestion[]
      }>,
    ) => {
      if (state.pages.length > 0) {
        const currentPageIndex = state.pages.length - 1
        state.pages[currentPageIndex] = {
          ...state.pages[currentPageIndex],
          commands: action.payload,
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // navigateToCommand cases
      .addCase(navigateToCommand.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(navigateToCommand.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload.success && action.payload.newPage) {
          state.pages.push(action.payload.newPage)
        }
      })
      .addCase(navigateToCommand.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
      // refreshCurrentPage cases
      .addCase(refreshCurrentPage.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(refreshCurrentPage.fulfilled, (state, action) => {
        state.loading = false
        if (
          action.payload.success &&
          action.payload.newCommands &&
          state.pages.length > 0
        ) {
          const currentPageIndex = state.pages.length - 1
          state.pages[currentPageIndex] = {
            ...state.pages[currentPageIndex],
            commands: action.payload.newCommands,
          }
        }
      })
      .addCase(refreshCurrentPage.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
  selectors: {
    // Current page is always the last one in the stack
    selectCurrentPage: (state) => state.pages[state.pages.length - 1],
    selectPages: (state) => state.pages,
    selectUI: (state) => state.ui,
    selectInitialCommands: (state) => state.initialCommands,
    selectLoading: (state) => state.loading,
    selectError: (state) => state.error,
  },
})

// Export actions
export const {
  setInitialCommands,
  updateSearchValue,
  navigateBack,
  showUI,
  hideUI,
  clearError,
  addPage,
  updateCurrentPageCommands,
} = navigationSlice.actions

// Export selectors
export const {
  selectCurrentPage,
  selectPages,
  selectUI,
  selectInitialCommands,
  selectLoading,
  selectError,
} = navigationSlice.selectors

// Helper function to get initial state with commands
export const getInitialStateWithCommands = (
  initialCommands: NavigationState["initialCommands"],
): NavigationState => ({
  pages: [
    {
      id: "root",
      commands: initialCommands,
      searchValue: "",
      parentPath: [],
    },
  ],
  ui: null,
  initialCommands,
  loading: false,
  error: null,
})

export default navigationSlice.reducer
