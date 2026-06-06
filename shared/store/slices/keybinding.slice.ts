import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

// State shape for keybinding configuration
interface KeybindingState {
  isCapturing: boolean
  targetCommandId: string | null
}

// Initial state
const initialState: KeybindingState = {
  isCapturing: false,
  targetCommandId: null,
}

// Create slice
export const keybindingSlice = createSlice({
  name: "keybinding",
  initialState,
  reducers: {
    // Start capturing a keybinding for a specific command
    startCapture: (state, action: PayloadAction<string>) => {
      state.isCapturing = true
      state.targetCommandId = action.payload
    },

    // Cancel keybinding capture without saving
    cancelCapture: (state) => {
      state.isCapturing = false
      state.targetCommandId = null
    },

    // Complete keybinding capture (for future use when we save)
    completeCapture: (state) => {
      state.isCapturing = false
      state.targetCommandId = null
    },
  },
  selectors: {
    // Select whether we're currently capturing a keybinding
    selectIsCapturing: (state) => state.isCapturing,

    // Select which command we're setting a keybinding for
    selectTargetCommandId: (state) => state.targetCommandId,
  },
})

// Export actions
export const { startCapture, cancelCapture, completeCapture } =
  keybindingSlice.actions

// Export selectors
export const { selectIsCapturing, selectTargetCommandId } =
  keybindingSlice.selectors

// Export reducer
export default keybindingSlice.reducer
