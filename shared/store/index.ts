import { configureStore } from "@reduxjs/toolkit"
import { commandPaletteStateSlice } from "./slices/commandPaletteState.slice"
import keybindingSlice from "./slices/keybinding.slice"
import { navigationSlice } from "./slices/navigation.slice"
import settingsSlice from "./slices/settings.slice"
import settingsCatalogSlice from "./slices/settingsCatalog.slice"
import snippetsSlice from "./slices/snippets.slice"

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
      settingsCatalog: settingsCatalogSlice,
      snippets: snippetsSlice,
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
        theme: {
          mode: "system" as "light" | "dark" | "system",
        },
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
        requirements: null,
      },
      settingsCatalog: {
        commands: [],
        loading: false,
        error: null,
        updatingIds: [],
      },
    },
  })
}

export type AppStore = ReturnType<typeof createAppStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
