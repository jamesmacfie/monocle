// Architecture: shared/ Redux layer. Mirrors the user-script documents
// stored under `monocle-userscripts` for the options page (list, builder,
// import/export). All reads and writes go through the typed background
// messages handled in background/messages/userScripts.ts — the UI never
// touches storage directly, matching the snippets slice it is modeled on.
// Also tracks test-run state (`runningIds`, `lastRunResult`) so the builder
// can show "Test on Active Tab" feedback without holding executable code.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import type {
  AddUserScriptResponse,
  DeleteUserScriptResponse,
  GetUserScriptsResponse,
  RunUserScriptResponse,
  UpdateUserScriptResponse,
  UserScript,
  UserScriptDraft,
  UserScriptRunResult,
} from "../../../shared/types"

type UserScriptsThunkApi = {
  sendMessage: (message: unknown) => Promise<unknown>
}

type UserScriptsState = {
  scripts: UserScript[]
  loading: boolean
  error: string | null
  updatingIds: string[]
  runningIds: string[]
  lastRunResult: { id: string; result: UserScriptRunResult } | null
}

const initialState: UserScriptsState = {
  scripts: [],
  loading: false,
  error: null,
  updatingIds: [],
  runningIds: [],
  lastRunResult: null,
}

const getSendMessage = (extra: unknown) =>
  (extra as UserScriptsThunkApi).sendMessage

export const loadUserScripts = createAsyncThunk<
  GetUserScriptsResponse,
  void,
  { extra: UserScriptsThunkApi; rejectValue: string }
>("userScripts/load", async (_, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "get-user-scripts",
    })) as GetUserScriptsResponse | { error?: string }

    if ("error" in response && response.error) {
      return rejectWithValue(response.error)
    }

    return response as GetUserScriptsResponse
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to load automations",
    )
  }
})

export const addUserScript = createAsyncThunk<
  UserScript,
  { script: UserScriptDraft },
  { extra: UserScriptsThunkApi; rejectValue: string }
>("userScripts/add", async ({ script }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "add-user-script",
      script,
    })) as AddUserScriptResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return response.script
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to add automation",
    )
  }
})

export const updateUserScript = createAsyncThunk<
  UserScript | null,
  { id: string; script: UserScriptDraft },
  { extra: UserScriptsThunkApi; rejectValue: string }
>("userScripts/update", async ({ id, script }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "update-user-script",
      id,
      script,
    })) as UpdateUserScriptResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return response.script
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to update automation",
    )
  }
})

export const deleteUserScript = createAsyncThunk<
  { id: string; deleted: boolean },
  { id: string },
  { extra: UserScriptsThunkApi; rejectValue: string }
>("userScripts/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "delete-user-script",
      id,
    })) as DeleteUserScriptResponse & { error?: string }

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

export const runUserScript = createAsyncThunk<
  { id: string; result: UserScriptRunResult },
  { id: string },
  { extra: UserScriptsThunkApi; rejectValue: string }
>("userScripts/run", async ({ id }, { extra, rejectWithValue }) => {
  try {
    // No context: the background engine targets the active tab (the
    // options-page test-run contract in shared/types/messaging.ts).
    const response = (await getSendMessage(extra)({
      type: "run-user-script",
      id,
    })) as RunUserScriptResponse & { error?: string }

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
  state: UserScriptsState,
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
  state: UserScriptsState,
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

export const userScriptsSlice = createSlice({
  name: "userScripts",
  initialState,
  reducers: {
    clearUserScriptsError: (state) => {
      state.error = null
    },
    clearLastRunResult: (state) => {
      state.lastRunResult = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadUserScripts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadUserScripts.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.scripts = action.payload.scripts
      })
      .addCase(loadUserScripts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? "Failed to load automations"
      })
      .addCase(addUserScript.fulfilled, (state, action) => {
        state.scripts.push(action.payload)
      })
      .addCase(addUserScript.rejected, (state, action) => {
        state.error = action.payload ?? "Failed to add automation"
      })
      .addCase(updateUserScript.pending, (state, action) => {
        setUpdating(state, action.meta.arg.id, true)
      })
      .addCase(updateUserScript.fulfilled, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        if (action.payload) {
          const index = state.scripts.findIndex(
            (script) => script.id === action.payload?.id,
          )
          if (index !== -1) {
            state.scripts[index] = action.payload
          }
        }
      })
      .addCase(updateUserScript.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        state.error = action.payload ?? "Failed to update automation"
      })
      .addCase(deleteUserScript.pending, (state, action) => {
        setUpdating(state, action.meta.arg.id, true)
      })
      .addCase(deleteUserScript.fulfilled, (state, action) => {
        setUpdating(state, action.payload.id, false)
        if (action.payload.deleted) {
          state.scripts = state.scripts.filter(
            (script) => script.id !== action.payload.id,
          )
        }
      })
      .addCase(deleteUserScript.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        state.error = action.payload ?? "Failed to delete automation"
      })
      .addCase(runUserScript.pending, (state, action) => {
        setRunning(state, action.meta.arg.id, true)
      })
      .addCase(runUserScript.fulfilled, (state, action) => {
        setRunning(state, action.payload.id, false)
        state.lastRunResult = action.payload
      })
      .addCase(runUserScript.rejected, (state, action) => {
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

export const { clearUserScriptsError, clearLastRunResult } =
  userScriptsSlice.actions

export const selectUserScripts = (state: { userScripts: UserScriptsState }) =>
  state.userScripts.scripts

export const selectUserScriptsLoading = (state: {
  userScripts: UserScriptsState
}) => state.userScripts.loading

export const selectUserScriptsError = (state: {
  userScripts: UserScriptsState
}) => state.userScripts.error

export const selectUserScriptsUpdatingIds = (state: {
  userScripts: UserScriptsState
}) => state.userScripts.updatingIds

export const selectUserScriptsRunningIds = (state: {
  userScripts: UserScriptsState
}) => state.userScripts.runningIds

export const selectUserScriptsLastRunResult = (state: {
  userScripts: UserScriptsState
}) => state.userScripts.lastRunResult

export default userScriptsSlice.reducer
