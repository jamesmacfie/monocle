// Architecture: shared/ Redux layer. Mirrors the automation documents
// stored under `monocle-automations` for the options page (list, builder,
// import/export). All reads and writes go through the typed background
// messages handled in background/messages/automations.ts — the UI never
// touches storage directly, matching the snippets slice it is modeled on.
// Also tracks test-run state (`runningIds`, `lastRunResult`) so the builder
// can show "Test on Active Tab" feedback without holding executable code.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
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

type AutomationsThunkApi = {
  sendMessage: (message: unknown) => Promise<unknown>
}

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

const getSendMessage = (extra: unknown) =>
  (extra as AutomationsThunkApi).sendMessage

export const loadAutomations = createAsyncThunk<
  GetAutomationsResponse,
  void,
  { extra: AutomationsThunkApi; rejectValue: string }
>("automations/load", async (_, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "monocle-automations-get",
    })) as GetAutomationsResponse | { error?: string }

    if ("error" in response && response.error) {
      return rejectWithValue(response.error)
    }

    return response as GetAutomationsResponse
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to load automations",
    )
  }
})

export const addAutomation = createAsyncThunk<
  Automation,
  { automation: AutomationDraft },
  { extra: AutomationsThunkApi; rejectValue: string }
>("automations/add", async ({ automation }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "monocle-automation-add",
      automation,
    })) as AddAutomationResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return response.automation
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to add automation",
    )
  }
})

export const updateAutomation = createAsyncThunk<
  Automation | null,
  { id: string; automation: AutomationDraft },
  { extra: AutomationsThunkApi; rejectValue: string }
>(
  "automations/update",
  async ({ id, automation }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "monocle-automation-update",
        id,
        automation,
      })) as UpdateAutomationResponse & { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return response.automation
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update automation",
      )
    }
  },
)

export const deleteAutomation = createAsyncThunk<
  { id: string; deleted: boolean },
  { id: string },
  { extra: AutomationsThunkApi; rejectValue: string }
>("automations/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "monocle-automation-delete",
      id,
    })) as DeleteAutomationResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return { id, deleted: response.deleted }
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to delete automation",
    )
  }
})

export const runAutomation = createAsyncThunk<
  { id: string; result: AutomationRunResult },
  { id: string },
  { extra: AutomationsThunkApi; rejectValue: string }
>("automations/run", async ({ id }, { extra, rejectWithValue }) => {
  try {
    // No context: the background engine targets the active tab (the
    // options-page test-run contract in shared/types/messaging.ts).
    const response = (await getSendMessage(extra)({
      type: "monocle-automation-run",
      id,
    })) as RunAutomationResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return { id, result: response.result }
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to run automation",
    )
  }
})

const setUpdating = (
  state: AutomationsState,
  id: string,
  isUpdating: boolean,
) => {
  if (isUpdating) {
    if (!state.updatingIds.includes(id)) {
      state.updatingIds.push(id)
    }
    return
  }

  state.updatingIds = state.updatingIds.filter((current) => current !== id)
}

const setRunning = (
  state: AutomationsState,
  id: string,
  isRunning: boolean,
) => {
  if (isRunning) {
    if (!state.runningIds.includes(id)) {
      state.runningIds.push(id)
    }
    return
  }

  state.runningIds = state.runningIds.filter((current) => current !== id)
}

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
        setUpdating(state, action.meta.arg.id, true)
      })
      .addCase(updateAutomation.fulfilled, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
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
        setUpdating(state, action.meta.arg.id, false)
        state.error = action.payload ?? "Failed to update automation"
      })
      .addCase(deleteAutomation.pending, (state, action) => {
        setUpdating(state, action.meta.arg.id, true)
      })
      .addCase(deleteAutomation.fulfilled, (state, action) => {
        setUpdating(state, action.payload.id, false)
        if (action.payload.deleted) {
          state.automations = state.automations.filter(
            (automation) => automation.id !== action.payload.id,
          )
        }
      })
      .addCase(deleteAutomation.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        state.error = action.payload ?? "Failed to delete automation"
      })
      .addCase(runAutomation.pending, (state, action) => {
        setRunning(state, action.meta.arg.id, true)
      })
      .addCase(runAutomation.fulfilled, (state, action) => {
        setRunning(state, action.payload.id, false)
        state.lastRunResult = action.payload
      })
      .addCase(runAutomation.rejected, (state, action) => {
        setRunning(state, action.meta.arg.id, false)
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
