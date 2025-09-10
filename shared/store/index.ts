import { configureStore } from "@reduxjs/toolkit"
import type { CommandSuggestion } from "../../types"
import { commandPaletteStateSlice } from "./slices/commandPaletteState.slice"
import keybindingSlice from "./slices/keybinding.slice"
import {
  getInitialStateWithCommands,
  navigationSlice,
} from "./slices/navigation.slice"
import settingsSlice from "./slices/settings.slice"

// Define extra argument type for thunks
export interface ThunkApi {
  sendMessage: (message: any) => Promise<any>
}

// Store factory for the entire app (including settings)
export const createAppStore = (
  sendMessage?: (message: any) => Promise<any>,
) => {
  return configureStore({
    reducer: {
      settings: settingsSlice,
      navigation: navigationSlice.reducer,
      commandPalette: commandPaletteStateSlice.reducer,
      keybinding: keybindingSlice,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: {
          // Provide background messaging to async thunks where needed
          extraArgument: { sendMessage } as ThunkApi,
        },
      }),
    preloadedState: {
      settings: {
        newTab: {
          clock: {
            show: true,
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
          },
        },
        loading: false,
        error: null,
      },
      commandPalette: { isOpen: false },
      keybinding: {
        isCapturing: false,
        targetCommandId: null,
        capturedKeybinding: null,
      },
    },
  })
}

// Original store factory for command palette (still needed for existing usage)
export const createNavigationStore = (
  initialCommands: {
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
    deepSearchItems: CommandSuggestion[]
  },
  sendMessage: (message: any) => Promise<any>,
) => {
  return configureStore({
    reducer: {
      navigation: navigationSlice.reducer,
      commandPalette: commandPaletteStateSlice.reducer,
      keybinding: keybindingSlice,
      settings: settingsSlice,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: {
          extraArgument: { sendMessage } as ThunkApi,
        },
      }),
    preloadedState: {
      navigation: getInitialStateWithCommands(initialCommands),
      commandPalette: { isOpen: false },
      keybinding: {
        isCapturing: false,
        targetCommandId: null,
        capturedKeybinding: null,
      },
      settings: {
        newTab: {
          clock: {
            show: true,
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
          },
        },
        loading: false,
        error: null,
      },
    },
  })
}

export type AppStore = ReturnType<typeof createAppStore>
export type NavigationStore = ReturnType<typeof createNavigationStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
