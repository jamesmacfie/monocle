import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

// State shape for keybinding configuration
interface KeybindingState {
  isCapturing: boolean
  targetCommandId: string | null
  capturedKeybinding: string | null
}

// Initial state
const initialState: KeybindingState = {
  isCapturing: false,
  targetCommandId: null,
  capturedKeybinding: null,
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
      state.capturedKeybinding = null
    },

    // Update the captured keybinding as user types
    setCapturedKeybinding: (state, action: PayloadAction<string>) => {
      state.capturedKeybinding = action.payload
    },

    // Cancel keybinding capture without saving
    cancelCapture: (state) => {
      state.isCapturing = false
      state.targetCommandId = null
      state.capturedKeybinding = null
    },

    // Complete keybinding capture (for future use when we save)
    completeCapture: (state) => {
      state.isCapturing = false
      state.targetCommandId = null
      state.capturedKeybinding = null
    },
  },
  selectors: {
    // Select whether we're currently capturing a keybinding
    selectIsCapturing: (state) => state.isCapturing,

    // Select which command we're setting a keybinding for
    selectTargetCommandId: (state) => state.targetCommandId,

    // Select the currently captured keybinding
    selectCapturedKeybinding: (state) => state.capturedKeybinding,
  },
})

// Export actions
export const {
  startCapture,
  setCapturedKeybinding,
  cancelCapture,
  completeCapture,
} = keybindingSlice.actions

// Export selectors
export const {
  selectIsCapturing,
  selectTargetCommandId,
  selectCapturedKeybinding,
} = keybindingSlice.selectors

// Export reducer
export default keybindingSlice.reducer
