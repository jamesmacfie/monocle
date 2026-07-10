// Architecture: shared/ Redux layer. Mirrors the automation documents
// stored under `monocle-automations` for the options page (list, builder,
// import/export). All reads and writes go through the typed background
// messages handled in background/messages/automations.ts — the UI never
// touches storage directly, matching the snippets slice it is modeled on.
// Also tracks test-run state (`runningIds`, `lastRunResult`) so the builder
// can show "Test on Active Tab" feedback without holding executable code.
import { createSlice } from "@reduxjs/toolkit"
import type {
  AddAutomationResponse,
  Automation,
  AutomationDraft,
  AutomationRunResult,
  DeleteAutomationResponse,
  GetAutomationsResponse,
  RunAutomationResponse,
  UpdateAutomationResponse,
} from "../../../shared/types"
import { createMessageThunk } from "../messageThunk"
import { toggleId } from "../updatingIds"

type AutomationsState = {
  automations: Automation[]
  loading: boolean
  error: string | null
  updatingIds: string[]
  runningIds: string[]
  lastRunResult: { id: string; result: AutomationRunResult } | null
}

const initialState: AutomationsState = {
  automations: [],
  loading: false,
  error: null,
  updatingIds: [],
  runningIds: [],
  lastRunResult: null,
}

export const loadAutomations = createMessageThunk<
  GetAutomationsResponse,
  void,
  GetAutomationsResponse
>(
  "automations/load",
  () => ({ type: "monocle-automations-get" }),
  (response) => response,
  "Failed to load automations",
)

export const addAutomation = createMessageThunk<
  Automation,
  { automation: AutomationDraft },
  AddAutomationResponse
>(
  "automations/add",
  ({ automation }) => ({ type: "monocle-automation-add", automation }),
  (response) => response.automation,
  "Failed to add automation",
)

export const updateAutomation = createMessageThunk<
  Automation | null,
  { id: string; automation: AutomationDraft },
  UpdateAutomationResponse
>(
  "automations/update",
  ({ id, automation }) => ({
    type: "monocle-automation-update",
    id,
    automation,
  }),
  (response) => response.automation,
  "Failed to update automation",
)

export const deleteAutomation = createMessageThunk<
  { id: string; deleted: boolean },
  { id: string },
  DeleteAutomationResponse
>(
  "automations/delete",
  ({ id }) => ({ type: "monocle-automation-delete", id }),
  (response, { id }) => ({ id, deleted: response.deleted }),
  "Failed to delete automation",
)

export const runAutomation = createMessageThunk<
  { id: string; result: AutomationRunResult },
  { id: string },
  RunAutomationResponse
>(
  "automations/run",
  // No context: the background engine targets the active tab.
  ({ id }) => ({ type: "monocle-automation-run", id }),
  (response, { id }) => ({ id, result: response.result }),
  "Failed to run automation",
)

export const automationsSlice = createSlice({
  name: "automations",
  initialState,
  reducers: {
    clearAutomationsError: (state) => {
      state.error = null
    },
    clearLastRunResult: (state) => {
      state.lastRunResult = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAutomations.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadAutomations.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.automations = action.payload.automations
      })
      .addCase(loadAutomations.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? "Failed to load automations"
      })
      .addCase(addAutomation.fulfilled, (state, action) => {
        state.automations.push(action.payload)
      })
      .addCase(addAutomation.rejected, (state, action) => {
        state.error = action.payload ?? "Failed to add automation"
      })
      .addCase(updateAutomation.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          true,
        )
      })
      .addCase(updateAutomation.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          false,
        )
        if (action.payload) {
          const index = state.automations.findIndex(
            (automation) => automation.id === action.payload?.id,
          )
          if (index !== -1) {
            state.automations[index] = action.payload
          }
        }
      })
      .addCase(updateAutomation.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          false,
        )
        state.error = action.payload ?? "Failed to update automation"
      })
      .addCase(deleteAutomation.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          true,
        )
      })
      .addCase(deleteAutomation.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.id,
          false,
        )
        if (action.payload.deleted) {
          state.automations = state.automations.filter(
            (automation) => automation.id !== action.payload.id,
          )
        }
      })
      .addCase(deleteAutomation.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          false,
        )
        state.error = action.payload ?? "Failed to delete automation"
      })
      .addCase(runAutomation.pending, (state, action) => {
        state.runningIds = toggleId(state.runningIds, action.meta.arg.id, true)
      })
      .addCase(runAutomation.fulfilled, (state, action) => {
        state.runningIds = toggleId(state.runningIds, action.payload.id, false)
        state.lastRunResult = action.payload
      })
      .addCase(runAutomation.rejected, (state, action) => {
        state.runningIds = toggleId(state.runningIds, action.meta.arg.id, false)
        state.lastRunResult = {
          id: action.meta.arg.id,
          result: {
            success: false,
            error: action.payload ?? "Failed to run automation",
            completedSteps: 0,
          },
        }
      })
  },
})

export const { clearAutomationsError, clearLastRunResult } =
  automationsSlice.actions

export const selectAutomations = (state: { automations: AutomationsState }) =>
  state.automations.automations

export const selectAutomationsLoading = (state: {
  automations: AutomationsState
}) => state.automations.loading

export const selectAutomationsError = (state: {
  automations: AutomationsState
}) => state.automations.error

export const selectAutomationsUpdatingIds = (state: {
  automations: AutomationsState
}) => state.automations.updatingIds

export const selectAutomationsRunningIds = (state: {
  automations: AutomationsState
}) => state.automations.runningIds

export const selectAutomationsLastRunResult = (state: {
  automations: AutomationsState
}) => state.automations.lastRunResult

export default automationsSlice.reducer
