import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import type {
  NewTabSettings,
  PermissionSettings,
  Settings,
  ThemeMode,
  ThemeSettings,
} from "../../../shared/types"
import { getBrowserAPI, sendRuntimeMessage } from "../../utils/extension-api"

// Cross-browser compatibility layer
const browserAPI = getBrowserAPI()

// Storage key for persisted settings (mirrors background/commands/settings.ts)
const STORAGE_KEY = "monocle-settings"

// Shared get-permissions round-trip used by the load/refresh thunks
const fetchPermissions = () =>
  sendRuntimeMessage<PermissionSettings>({ type: "get-permissions" })

// Settings state structure
interface SettingsState {
  theme: ThemeSettings
  newTab: NewTabSettings
  permissions: PermissionSettings
  loading: boolean
  error: string | null
}

const initialState: SettingsState = {
  theme: {
    mode: "system", // Default to system theme
  },
  newTab: {
    clock: {
      show: true, // Default to showing clock
    },
  },
  permissions: {
    isLoaded: false,
    access: {
      activeTab: false,
      bookmarks: false,
      browsingData: false,
      contextualIdentities: false,
      cookies: false,
      downloads: false,
      history: false,
      sessions: false,
      storage: false,
      tabs: false,
      tabGroups: false,
      management: false,
    },
  },
  loading: false,
  error: null,
}

// Async thunk to load settings from storage
export const loadSettings = createAsyncThunk(
  "settings/loadSettings",
  async (_, { rejectWithValue }) => {
    try {
      const result = (await browserAPI.storage.local.get(
        STORAGE_KEY,
      )) as Record<string, Settings | undefined>
      const settings = result[STORAGE_KEY] || {}

      return {
        theme: settings.theme || {},
        newTab: settings.newTab || {},
      }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load settings",
      )
    }
  },
)

// Async thunk to load permissions from background script
export const loadPermissions = createAsyncThunk(
  "settings/loadPermissions",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchPermissions()
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load permissions",
      )
    }
  },
)

// Async thunk to refresh permissions from background script
export const refreshPermissions = createAsyncThunk(
  "settings/refreshPermissions",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchPermissions()
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to refresh permissions",
      )
    }
  },
)

// Async thunk to update theme preference and sync to storage
export const updateThemeMode = createAsyncThunk(
  "settings/updateThemeMode",
  async (mode: ThemeMode, { rejectWithValue }) => {
    try {
      // Get current settings from storage
      const result = await browserAPI.storage.local.get(STORAGE_KEY)
      const currentSettings: Settings = result[STORAGE_KEY] || {}

      // Update the theme setting
      const updatedSettings: Settings = {
        ...currentSettings,
        theme: {
          ...currentSettings.theme,
          mode,
        },
      }

      // Save to storage
      await browserAPI.storage.local.set({
        [STORAGE_KEY]: updatedSettings,
      })

      return mode
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update theme mode",
      )
    }
  },
)

// Async thunk to update clock visibility and sync to storage
export const updateClockVisibility = createAsyncThunk(
  "settings/updateClockVisibility",
  async (show: boolean, { rejectWithValue }) => {
    try {
      // Get current settings from storage
      const result = await browserAPI.storage.local.get(STORAGE_KEY)
      const currentSettings: Settings = result[STORAGE_KEY] || {}

      // Update the clock setting
      const updatedSettings: Settings = {
        ...currentSettings,
        newTab: {
          ...currentSettings.newTab,
          clock: {
            ...currentSettings.newTab?.clock,
            show,
          },
        },
      }

      // Save to storage
      await browserAPI.storage.local.set({
        [STORAGE_KEY]: updatedSettings,
      })

      return show
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to update clock visibility",
      )
    }
  },
)

// Async thunk to update new-tab background categories and sync to storage
export const updateBackgroundCategories = createAsyncThunk(
  "settings/updateBackgroundCategories",
  async (categories: string[], { rejectWithValue }) => {
    try {
      // Get current settings from storage
      const result = await browserAPI.storage.local.get(STORAGE_KEY)
      const currentSettings: Settings = result[STORAGE_KEY] || {}

      // Update the background categories setting
      const updatedSettings: Settings = {
        ...currentSettings,
        newTab: {
          ...currentSettings.newTab,
          backgroundCategories: categories,
        },
      }

      // Save to storage
      await browserAPI.storage.local.set({
        [STORAGE_KEY]: updatedSettings,
      })

      return categories
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to update background categories",
      )
    }
  },
)

// Settings slice
export const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Load settings
      .addCase(loadSettings.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadSettings.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.theme = {
          mode: "system", // Default fallback
          ...action.payload.theme,
        }
        state.newTab = {
          ...state.newTab,
          ...action.payload.newTab,
          clock: {
            show: true, // Default fallback
            ...action.payload.newTab.clock,
          },
        }
      })
      .addCase(loadSettings.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

      // Update theme mode
      .addCase(updateThemeMode.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateThemeMode.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.theme = {
          ...state.theme,
          mode: action.payload,
        }
      })
      .addCase(updateThemeMode.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

      // Update clock visibility
      .addCase(updateClockVisibility.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateClockVisibility.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.newTab.clock = {
          ...state.newTab.clock,
          show: action.payload,
        }
      })
      .addCase(updateClockVisibility.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

      // Update background categories
      .addCase(updateBackgroundCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateBackgroundCategories.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.newTab.backgroundCategories = action.payload
      })
      .addCase(updateBackgroundCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

      // Load permissions
      .addCase(loadPermissions.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadPermissions.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.permissions = action.payload
      })
      .addCase(loadPermissions.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
        state.permissions.isLoaded = false
      })

      // Refresh permissions
      .addCase(refreshPermissions.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(refreshPermissions.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.permissions = action.payload
      })
      .addCase(refreshPermissions.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
})

export const { clearError } = settingsSlice.actions

// Selectors
export const selectThemeMode = (state: { settings: SettingsState }) =>
  state.settings.theme.mode ?? "system"

export const selectClockVisibility = (state: { settings: SettingsState }) =>
  state.settings.newTab.clock?.show ?? true

export const selectBackgroundCategories = (state: {
  settings: SettingsState
}) => state.settings.newTab.backgroundCategories ?? []

export const selectPermissions = (state: { settings: SettingsState }) =>
  state.settings.permissions

export default settingsSlice.reducer
