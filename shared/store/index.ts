import { configureStore } from "@reduxjs/toolkit"
import type { CommandSuggestion } from "../../types"
import { commandPaletteStateSlice } from "./slices/commandPaletteState.slice"
import {
  getInitialStateWithCommands,
  navigationSlice,
} from "./slices/navigation.slice"

// Define extra argument type for thunks
export interface ThunkApi {
  sendMessage: (message: any) => Promise<any>
}

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
    },
  })
}

export type AppStore = ReturnType<typeof createNavigationStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
