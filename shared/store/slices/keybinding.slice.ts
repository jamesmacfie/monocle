import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import type { KeybindingRequirements } from "../../types/commands"

// State shape for keybinding configuration
interface KeybindingState {
  isCapturing: boolean
  targetCommandId: string | null
  // The target command's assignment constraints, so the capture UI can hint
  // them before the first stroke (e.g. snippet bindings need a modifier).
  requirements: KeybindingRequirements | null
}

// Initial state
const initialState: KeybindingState = {
  isCapturing: false,
  targetCommandId: null,
  requirements: null,
}

// Create slice
export const keybindingSlice = createSlice({
  name: "keybinding",
  initialState,
  reducers: {
    // Start capturing a keybinding for a specific command
    startCapture: (
      state,
      action: PayloadAction<{
        commandId: string
        requirements?: KeybindingRequirements
      }>,
    ) => {
      state.isCapturing = true
      state.targetCommandId = action.payload.commandId
      state.requirements = action.payload.requirements ?? null
    },

    // Cancel keybinding capture without saving
    cancelCapture: (state) => {
      state.isCapturing = false
      state.targetCommandId = null
      state.requirements = null
    },

    // Complete keybinding capture (for future use when we save)
    completeCapture: (state) => {
      state.isCapturing = false
      state.targetCommandId = null
      state.requirements = null
    },
  },
  selectors: {
    // Select whether we're currently capturing a keybinding
    selectIsCapturing: (state) => state.isCapturing,

    // Select which command we're setting a keybinding for
    selectTargetCommandId: (state) => state.targetCommandId,

    // Select the target command's keybinding requirements
    selectCaptureRequirements: (state) => state.requirements,
  },
})

// Export actions
export const { startCapture, cancelCapture, completeCapture } =
  keybindingSlice.actions

// Export selectors
export const {
  selectIsCapturing,
  selectTargetCommandId,
  selectCaptureRequirements,
} = keybindingSlice.selectors

// Export reducer
export default keybindingSlice.reducer
