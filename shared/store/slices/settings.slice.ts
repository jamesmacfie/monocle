import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit"
import type { NewTabSettings, Settings } from "../../../types"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

// Settings state structure
interface SettingsState {
  newTab: NewTabSettings
  loading: boolean
  error: string | null
}

const initialState: SettingsState = {
  newTab: {
    clock: {
      show: true, // Default to showing clock
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
      const STORAGE_KEY = "monocle-settings"
      const result = await browserAPI.storage.local.get(STORAGE_KEY)
      const settings = result[STORAGE_KEY] || {}

      return {
        newTab: settings.newTab || {},
      }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load settings",
      )
    }
  },
)

// Async thunk to update clock visibility and sync to storage
export const updateClockVisibility = createAsyncThunk(
  "settings/updateClockVisibility",
  async (show: boolean, { getState, rejectWithValue }) => {
    try {
      const STORAGE_KEY = "monocle-settings"

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

// Settings slice
export const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    // Synchronous update for immediate UI feedback
    setClockVisibility: (state, action: PayloadAction<boolean>) => {
      state.newTab.clock = {
        ...state.newTab.clock,
        show: action.payload,
      }
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
  },
})

export const { clearError, setClockVisibility } = settingsSlice.actions

// Selectors
export const selectNewTabSettings = (state: { settings: SettingsState }) =>
  state.settings.newTab

export const selectClockVisibility = (state: { settings: SettingsState }) =>
  state.settings.newTab.clock?.show ?? true

export const selectSettingsLoading = (state: { settings: SettingsState }) =>
  state.settings.loading

export const selectSettingsError = (state: { settings: SettingsState }) =>
  state.settings.error

export default settingsSlice.reducer
