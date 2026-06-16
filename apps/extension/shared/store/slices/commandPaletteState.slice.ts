import { createSlice } from "@reduxjs/toolkit"

export interface CommandPaletteStateState {
  isOpen: boolean
}

const initialState: CommandPaletteStateState = {
  isOpen: false,
}

export const commandPaletteStateSlice = createSlice({
  name: "commandPaletteState",
  initialState,
  reducers: {
    showUI: (state) => {
      state.isOpen = true
    },
    hideUI: (state) => {
      state.isOpen = false
    },
    toggleUI: (state) => {
      state.isOpen = !state.isOpen
    },
  },
})

export const { showUI, hideUI, toggleUI } = commandPaletteStateSlice.actions

// Selectors
export const selectIsOpen = (state: {
  commandPalette: CommandPaletteStateState
}) => state.commandPalette.isOpen

export default commandPaletteStateSlice.reducer
