import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import type {
  AddSnippetResponse,
  DeleteSnippetResponse,
  GetSnippetsResponse,
  Snippet,
  UpdateSnippetResponse,
} from "../../../shared/types"

type SnippetsThunkApi = {
  sendMessage: (message: unknown) => Promise<unknown>
}

type SnippetsState = {
  snippets: Snippet[]
  loading: boolean
  error: string | null
  updatingIds: string[]
}

const initialState: SnippetsState = {
  snippets: [],
  loading: false,
  error: null,
  updatingIds: [],
}

const getSendMessage = (extra: unknown) =>
  (extra as SnippetsThunkApi).sendMessage

export const loadSnippets = createAsyncThunk<
  GetSnippetsResponse,
  void,
  { extra: SnippetsThunkApi; rejectValue: string }
>("snippets/load", async (_, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "get-snippets",
    })) as GetSnippetsResponse | { error?: string }

    if ("error" in response && response.error) {
      return rejectWithValue(response.error)
    }

    return response as GetSnippetsResponse
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to load snippets",
    )
  }
})

export const addSnippet = createAsyncThunk<
  Snippet,
  { name: string; body: string },
  { extra: SnippetsThunkApi; rejectValue: string }
>("snippets/add", async ({ name, body }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "add-snippet",
      name,
      body,
    })) as AddSnippetResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return response.snippet
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to add snippet",
    )
  }
})

export const updateSnippet = createAsyncThunk<
  Snippet | null,
  { id: string; name?: string; body?: string },
  { extra: SnippetsThunkApi; rejectValue: string }
>("snippets/update", async ({ id, name, body }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "update-snippet",
      id,
      ...(name !== undefined ? { name } : {}),
      ...(body !== undefined ? { body } : {}),
    })) as UpdateSnippetResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return response.snippet
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to update snippet",
    )
  }
})

export const deleteSnippet = createAsyncThunk<
  { id: string; deleted: boolean },
  { id: string },
  { extra: SnippetsThunkApi; rejectValue: string }
>("snippets/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "delete-snippet",
      id,
    })) as DeleteSnippetResponse & { error?: string }

    if (response?.error) {
      return rejectWithValue(response.error)
    }

    return { id, deleted: response.deleted }
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to delete snippet",
    )
  }
})

const setUpdating = (state: SnippetsState, id: string, isUpdating: boolean) => {
  if (isUpdating) {
    if (!state.updatingIds.includes(id)) {
      state.updatingIds.push(id)
    }
    return
  }

  state.updatingIds = state.updatingIds.filter((current) => current !== id)
}

export const snippetsSlice = createSlice({
  name: "snippets",
  initialState,
  reducers: {
    clearSnippetsError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSnippets.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadSnippets.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.snippets = action.payload.snippets
      })
      .addCase(loadSnippets.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? "Failed to load snippets"
      })
      .addCase(addSnippet.fulfilled, (state, action) => {
        state.snippets.push(action.payload)
      })
      .addCase(addSnippet.rejected, (state, action) => {
        state.error = action.payload ?? "Failed to add snippet"
      })
      .addCase(updateSnippet.pending, (state, action) => {
        setUpdating(state, action.meta.arg.id, true)
      })
      .addCase(updateSnippet.fulfilled, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        if (action.payload) {
          const index = state.snippets.findIndex(
            (snippet) => snippet.id === action.payload?.id,
          )
          if (index !== -1) {
            state.snippets[index] = action.payload
          }
        }
      })
      .addCase(updateSnippet.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        state.error = action.payload ?? "Failed to update snippet"
      })
      .addCase(deleteSnippet.pending, (state, action) => {
        setUpdating(state, action.meta.arg.id, true)
      })
      .addCase(deleteSnippet.fulfilled, (state, action) => {
        setUpdating(state, action.payload.id, false)
        if (action.payload.deleted) {
          state.snippets = state.snippets.filter(
            (snippet) => snippet.id !== action.payload.id,
          )
        }
      })
      .addCase(deleteSnippet.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.id, false)
        state.error = action.payload ?? "Failed to delete snippet"
      })
  },
})

export const { clearSnippetsError } = snippetsSlice.actions

export const selectSnippets = (state: { snippets: SnippetsState }) =>
  state.snippets.snippets

export const selectSnippetsLoading = (state: { snippets: SnippetsState }) =>
  state.snippets.loading

export const selectSnippetsError = (state: { snippets: SnippetsState }) =>
  state.snippets.error

export const selectSnippetsUpdatingIds = (state: { snippets: SnippetsState }) =>
  state.snippets.updatingIds

export default snippetsSlice.reducer
