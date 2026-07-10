// Architecture: shared Redux mirror for snippets. Typed message thunks cross
// to background-owned snippet storage for load/add/update/delete operations;
// the slice owns only UI state, errors, and concurrent updating ids. See
// docs/snippets.md.
import { createSlice } from "@reduxjs/toolkit"
import type {
  AddSnippetResponse,
  DeleteSnippetResponse,
  GetSnippetsResponse,
  Snippet,
  UpdateSnippetResponse,
} from "../../../shared/types"
import { createMessageThunk } from "../messageThunk"
import { toggleId } from "../updatingIds"

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

export const loadSnippets = createMessageThunk<
  GetSnippetsResponse,
  void,
  GetSnippetsResponse
>(
  "snippets/load",
  () => ({ type: "monocle-snippets-get" }),
  (response) => response,
  "Failed to load snippets",
)

export const addSnippet = createMessageThunk<
  Snippet,
  { name: string; body: string },
  AddSnippetResponse
>(
  "snippets/add",
  ({ name, body }) => ({ type: "monocle-snippet-add", name, body }),
  (response) => response.snippet,
  "Failed to add snippet",
)

export const updateSnippet = createMessageThunk<
  Snippet | null,
  { id: string; name?: string; body?: string },
  UpdateSnippetResponse
>(
  "snippets/update",
  ({ id, name, body }) => ({
    type: "monocle-snippet-update",
    id,
    ...(name !== undefined ? { name } : {}),
    ...(body !== undefined ? { body } : {}),
  }),
  (response) => response.snippet,
  "Failed to update snippet",
)

export const deleteSnippet = createMessageThunk<
  { id: string; deleted: boolean },
  { id: string },
  DeleteSnippetResponse
>(
  "snippets/delete",
  ({ id }) => ({ type: "monocle-snippet-delete", id }),
  (response, { id }) => ({ id, deleted: response.deleted }),
  "Failed to delete snippet",
)

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
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          true,
        )
      })
      .addCase(updateSnippet.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          false,
        )
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
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          false,
        )
        state.error = action.payload ?? "Failed to update snippet"
      })
      .addCase(deleteSnippet.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          true,
        )
      })
      .addCase(deleteSnippet.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.id,
          false,
        )
        if (action.payload.deleted) {
          state.snippets = state.snippets.filter(
            (snippet) => snippet.id !== action.payload.id,
          )
        }
      })
      .addCase(deleteSnippet.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.id,
          false,
        )
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
