import { configureStore } from "@reduxjs/toolkit"
import { commandPaletteStateSlice } from "./slices/commandPaletteState.slice"

export const createCommandPaletteStore = (initialIsOpen: boolean = false) => {
  return configureStore({
    reducer: {
      commandPalette: commandPaletteStateSlice.reducer,
    },
    preloadedState: {
      commandPalette: { isOpen: initialIsOpen },
    },
  })
}

export type CommandPaletteStore = ReturnType<typeof createCommandPaletteStore>
export type CommandPaletteRootState = ReturnType<
  CommandPaletteStore["getState"]
>
export type CommandPaletteDispatch = CommandPaletteStore["dispatch"]
