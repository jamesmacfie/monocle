// Architecture: shared/ palette navigation state, used by both the content
// overlay and the new-tab palette.
//
// The palette is a stack of pages: `pages[0]` is "root", and selecting a
// group/search command pushes a child page. The current page is always the
// last element. Each page carries its own search box value, `formValues` for
// inline inputs, and (for child group pages) its `parentPath` — the chain of
// parent command ids the background needs to re-resolve dynamic children
// without re-walking from root.
//
// Search is background-owned: `searchCurrentPage` fires per keystroke and the
// background returns ranked `searchResults` that render in place of
// favorites/suggestions. Because responses are async and can arrive out of
// order, every search/refresh carries a monotonic guard — `searchSeq` (drop
// older responses) and an echoed `query` (drop responses for a query the user
// has already typed past); `refreshRequest` plays the same role for child-page
// reloads. CMDK's input value is synchronized with `page.searchValue` here, so
// any change to clearing/restoring search needs manual regression checks in
// both palette modes. See docs/palette-ui-and-navigation.md.
import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit"
import type { Suggestion } from "../../../shared/types"
import { computeDefaultFormValues } from "../../utils/forms"
import type { ThunkApi } from "../index"

// Types from original hook
export type Page = {
  id: string
  commands: {
    favorites: Suggestion[]
    suggestions: Suggestion[]
  }
  searchValue: string
  parent?: Suggestion
  parentPath: string[] // Track the path of parent command IDs
  formValues?: Record<string, string | string[]> // For inline input values
  // When true, this page's children are driven by search input
  dynamicChildren?: boolean
  // Background search results for the current searchValue (root and child
  // group pages). Rendered instead of favorites/suggestions while searching.
  searchResults?: Suggestion[]
  searchLoading?: boolean
  // Last applied search-commands sequence number, used to drop stale responses
  searchSeq?: number
}

// State shape
interface NavigationState {
  pages: Page[]
  // Keep initial commands for root page updates
  initialCommands: {
    favorites: Suggestion[]
    suggestions: Suggestion[]
  }
  loading: boolean
  error: string | null
  refreshRequest: {
    requestId: string
    pageId: string
    searchValue: string
  } | null
}

// Helper function to find a command in the current page's commands or search results
export function findCommandInPage(
  page: Page,
  commandId: string,
): Suggestion | undefined {
  return (
    (page.commands.favorites || []).find(
      (command) => command.id === commandId,
    ) ||
    (page.commands.suggestions || []).find(
      (command) => command.id === commandId,
    ) ||
    (page.searchResults || []).find((command) => command.id === commandId)
  )
}

// Async thunks

/**
 * Drill into a group/search command: ask the background for its children
 * (passing `parentPath` so it can locate the node without re-walking) and, if
 * any exist (or the background explicitly requests `openPage`), build and push
 * a new child page seeded with default inline-input form values. Returns
 * `{ success: false }` for leaf/childless commands so no page is pushed.
 */
export const navigateToCommand = createAsyncThunk<
  {
    success: boolean
    newPage?: Page
  },
  {
    id: string
    currentPage: Page
  },
  { extra: ThunkApi }
>(
  "navigation/navigateToCommand",
  async ({ id, currentPage }, { extra, rejectWithValue }) => {
    try {
      if (!extra || typeof extra.sendMessage !== "function") {
        return rejectWithValue(
          "Messaging unavailable: sendMessage not provided",
        )
      }
      // Build parent path for backend to efficiently locate the command
      const parentPath = currentPage.id === "root" ? [] : currentPage.parentPath

      // Request children from background script
      const response = (await extra.sendMessage({
        type: "monocle-command-children-get",
        id,
        parentPath,
      })) as {
        openPage?: boolean
        children?: Suggestion[]
        dynamicChildren?: boolean
      }

      // Decide whether to open a new page: open when children exist or explicitly requested by backend
      const shouldOpenPage =
        (response && response.openPage === true) ||
        (response?.children && response.children.length > 0)

      if (shouldOpenPage) {
        // Store reference to parent command for breadcrumb navigation
        const parentCommand = findCommandInPage(currentPage, id)

        // Build path for the new page (used by future child navigations)
        const newParentPath =
          currentPage.id === "root"
            ? [id] // First level: just this command ID
            : [...currentPage.parentPath, id] // Nested: append to existing path

        // Create new page
        const defaults = computeDefaultFormValues(
          (response.children || []) as Suggestion[],
        )
        const newPage: Page = {
          id,
          commands: {
            favorites: [], // Child pages don't inherit favorites
            suggestions: response.children || [], // All children go to suggestions
          },
          searchValue: "", // Always start with empty search to show all children
          parent: parentCommand,
          parentPath: newParentPath,
          formValues: defaults, // Initialize with defaults from input fields
          dynamicChildren: response?.dynamicChildren === true,
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

/**
 * Re-fetch the current child page's children in place (after an action mutates
 * command state, e.g. toggling a favorite or assigning a keybinding). No-ops on
 * root (refreshed via setInitialCommands) and on dynamic-children pages with an
 * empty query (those wait for search input). Re-fetched children's input
 * defaults are merged under existing `formValues` so user-entered values
 * survive. The `refreshRequest` stamp lets the fulfilled reducer discard a
 * response if the page or query changed while it was in flight.
 */
export const refreshCurrentPage = createAsyncThunk<
  {
    success: boolean
    newCommands?: {
      favorites: Suggestion[]
      suggestions: Suggestion[]
    }
    newFormValues?: Record<string, string | string[]>
  },
  { currentPage: Page },
  { extra: ThunkApi }
>(
  "navigation/refreshCurrentPage",
  async ({ currentPage }, { extra, rejectWithValue, getState }) => {
    // Only refresh if we're on a child page (not root)
    if (currentPage.id === "root") {
      return { success: false } // Root page is refreshed via setInitialCommands
    }

    try {
      if (!extra || typeof extra.sendMessage !== "function") {
        return rejectWithValue(
          "Messaging unavailable: sendMessage not provided",
        )
      }

      if (
        currentPage.dynamicChildren &&
        currentPage.searchValue.trim().length === 0
      ) {
        const root: any = getState()
        const currentValues =
          root?.navigation?.pages?.[root.navigation.pages.length - 1]
            ?.formValues || {}

        return {
          success: true,
          newCommands: {
            favorites: [],
            suggestions: [],
          },
          newFormValues: currentValues,
        }
      }

      // Re-fetch children for the current parent command
      const parentPath = currentPage.parentPath.slice(0, -1) // Remove current page ID to get parent path
      const response = (await extra.sendMessage({
        type: "monocle-command-children-get",
        id: currentPage.id,
        parentPath,
        searchValue: currentPage.searchValue,
      })) as { children?: Suggestion[] }

      if (response.children) {
        // Merge defaults for any new inputs into existing formValues
        const newSuggestions = response.children as Suggestion[]
        const defaults = computeDefaultFormValues(newSuggestions)
        const root: any = getState()
        const currentValues =
          root?.navigation?.pages?.[root.navigation.pages.length - 1]
            ?.formValues || {}
        const mergedValues = { ...defaults, ...currentValues }
        return {
          success: true,
          newCommands: {
            favorites: [],
            suggestions: response.children,
          },
          newFormValues: mergedValues,
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

/**
 * Background-owned search for the current page (one call per debounced
 * keystroke). Root pages send an empty parentPath; child group pages send their
 * full parent path so the background scopes results to that subtree. Responses
 * echo `seq` + `query` so the fulfilled reducer can drop stale (out-of-order or
 * typed-past) results, mirroring the `refreshRequest` staleness guard.
 */
export const searchCurrentPage = createAsyncThunk<
  {
    results: Suggestion[]
    seq: number
    query: string
  },
  {
    pageId: string
    parentPath: string[]
    query: string
    seq: number
  },
  { extra: ThunkApi }
>(
  "navigation/searchCurrentPage",
  async ({ pageId, parentPath, query, seq }, { extra, rejectWithValue }) => {
    try {
      if (!extra || typeof extra.sendMessage !== "function") {
        return rejectWithValue(
          "Messaging unavailable: sendMessage not provided",
        )
      }

      const response = (await extra.sendMessage({
        type: "monocle-commands-search",
        query,
        parentPath: pageId === "root" ? [] : parentPath,
        seq,
      })) as {
        error?: string
        results?: Suggestion[]
        seq?: number
        query?: string
      }

      if (!response || response.error) {
        return rejectWithValue(response?.error || "Failed to search commands")
      }

      return {
        results: response.results || [],
        seq: response.seq ?? seq,
        query: response.query ?? query,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search commands"
      console.error("❌ Error searching commands:", error)
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
            formValues: {},
            dynamicChildren: false,
          },
        ]
      : [
          {
            id: "root",
            commands: {
              favorites: [],
              suggestions: [],
            },
            searchValue: "",
            parentPath: [],
            formValues: {},
            dynamicChildren: false,
          },
        ],
    initialCommands: initialCommands || {
      favorites: [],
      suggestions: [],
    },
    loading: false,
    error: null,
    refreshRequest: null,
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
            formValues: {},
          },
        ]
      }
    },

    // Update search value for current page
    updateSearchValue: (state, action: PayloadAction<string>) => {
      if (state.pages.length > 0) {
        const currentPageIndex = state.pages.length - 1
        const currentPage = state.pages[currentPageIndex]
        const isCleared = action.payload.trim().length === 0
        state.pages[currentPageIndex] = {
          ...currentPage,
          searchValue: action.payload,
          commands:
            currentPage.dynamicChildren && isCleared
              ? { favorites: [], suggestions: [] }
              : currentPage.commands,
          // Clearing the query instantly restores the non-search rendering
          searchResults: isCleared ? undefined : currentPage.searchResults,
          searchLoading: isCleared ? false : currentPage.searchLoading,
        }
      }
    },

    // Drop background search results for the current page (empty query)
    clearSearchResults: (state) => {
      if (state.pages.length > 0) {
        const currentPageIndex = state.pages.length - 1
        state.pages[currentPageIndex] = {
          ...state.pages[currentPageIndex],
          searchResults: undefined,
          searchLoading: false,
        }
      }
    },

    // Navigate back to previous page
    navigateBack: (state) => {
      // Can't go back from root page
      if (state.pages.length <= 1) return

      // Pop current page from navigation stack
      state.pages = state.pages.slice(0, -1)
    },

    // Clear error state
    clearError: (state) => {
      state.error = null
    },

    // Set form value for current page
    setFormValue: (
      state,
      action: PayloadAction<{ fieldId: string; value: string | string[] }>,
    ) => {
      if (state.pages.length > 0) {
        const currentPageIndex = state.pages.length - 1
        if (!state.pages[currentPageIndex].formValues) {
          state.pages[currentPageIndex].formValues = {}
        }
        state.pages[currentPageIndex].formValues![action.payload.fieldId] =
          action.payload.value
      }
    },

    // Add new page to navigation stack (used by successful navigateToCommand)
    addPage: (state, action: PayloadAction<Page>) => {
      state.pages.push(action.payload)
    },

    // Reset the navigation stack back to the root page. Used when the palette
    // closes so that reopening starts at home rather than on a deep child page.
    resetNavigation: (state) => {
      state.pages = [
        {
          id: "root",
          commands: state.initialCommands,
          searchValue: "",
          parentPath: [],
          formValues: {},
          dynamicChildren: false,
        },
      ]
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
      .addCase(refreshCurrentPage.pending, (state, action) => {
        state.loading = true
        state.error = null
        state.refreshRequest = {
          requestId: action.meta.requestId,
          pageId: action.meta.arg.currentPage.id,
          searchValue: action.meta.arg.currentPage.searchValue,
        }
      })
      .addCase(refreshCurrentPage.fulfilled, (state, action) => {
        const pendingRequest = state.refreshRequest

        if (
          !pendingRequest ||
          pendingRequest.requestId !== action.meta.requestId ||
          state.pages.length === 0
        ) {
          return
        }

        state.loading = false
        state.refreshRequest = null

        const currentPageIndex = state.pages.length - 1
        const currentPage = state.pages[currentPageIndex]
        if (
          currentPage.id !== pendingRequest.pageId ||
          currentPage.searchValue !== pendingRequest.searchValue
        ) {
          return
        }

        if (action.payload.success && action.payload.newCommands) {
          state.pages[currentPageIndex] = {
            ...state.pages[currentPageIndex],
            commands: action.payload.newCommands,
            formValues:
              action.payload.newFormValues ||
              state.pages[currentPageIndex].formValues,
          }
        }
      })
      .addCase(refreshCurrentPage.rejected, (state, action) => {
        if (state.refreshRequest?.requestId !== action.meta.requestId) return
        state.loading = false
        state.refreshRequest = null
        state.error = action.payload as string
      })
      // searchCurrentPage cases — guard against page changes and stale responses
      .addCase(searchCurrentPage.pending, (state, action) => {
        const currentPageIndex = state.pages.length - 1
        if (
          currentPageIndex < 0 ||
          state.pages[currentPageIndex].id !== action.meta.arg.pageId
        ) {
          return
        }

        state.pages[currentPageIndex] = {
          ...state.pages[currentPageIndex],
          searchLoading: true,
        }
      })
      .addCase(searchCurrentPage.fulfilled, (state, action) => {
        const currentPageIndex = state.pages.length - 1
        if (currentPageIndex < 0) return

        const currentPage = state.pages[currentPageIndex]

        // Only apply to the page the search was issued for
        if (currentPage.id !== action.meta.arg.pageId) return

        // Drop out-of-order responses
        if (
          currentPage.searchSeq !== undefined &&
          action.payload.seq < currentPage.searchSeq
        ) {
          return
        }

        // Drop responses for a query the user has already typed past; the
        // debounced follow-up request for the newer query releases the spinner
        if (action.payload.query !== currentPage.searchValue) {
          return
        }

        state.pages[currentPageIndex] = {
          ...currentPage,
          searchResults: action.payload.results,
          searchLoading: false,
          searchSeq: action.payload.seq,
        }
      })
      .addCase(searchCurrentPage.rejected, (state, action) => {
        const currentPageIndex = state.pages.length - 1
        if (
          currentPageIndex < 0 ||
          state.pages[currentPageIndex].id !== action.meta.arg.pageId
        ) {
          return
        }

        // Search failures are non-fatal: stop the spinner, keep prior results
        state.pages[currentPageIndex] = {
          ...state.pages[currentPageIndex],
          searchLoading: false,
        }
      })
  },
  selectors: {
    // Current page is always the last one in the stack
    selectCurrentPage: (state) => state.pages[state.pages.length - 1],
    selectPages: (state) => state.pages,
    selectInitialCommands: (state) => state.initialCommands,
    selectLoading: (state) => state.loading,
    selectError: (state) => state.error,
  },
})

// Export actions
export const {
  setInitialCommands,
  updateSearchValue,
  clearSearchResults,
  navigateBack,
  clearError,
  setFormValue,
  addPage,
  resetNavigation,
} = navigationSlice.actions

// Export selectors
export const {
  selectCurrentPage,
  selectPages,
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
      formValues: {},
      dynamicChildren: false,
    },
  ],
  initialCommands,
  loading: false,
  error: null,
  refreshRequest: null,
})

export default navigationSlice.reducer
