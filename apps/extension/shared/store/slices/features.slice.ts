import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import type {
  ExecuteFeatureActionResponse,
  FeatureDescriptor,
  GetFeaturesResponse,
  UpdateFeatureConfigResponse,
} from "../../../shared/types"

type FeaturesThunkApi = {
  sendMessage: (message: unknown) => Promise<unknown>
}

type FeaturesState = {
  features: FeatureDescriptor[]
  loading: boolean
  error: string | null
  updatingIds: string[]
}

const initialState: FeaturesState = {
  features: [],
  loading: false,
  error: null,
  updatingIds: [],
}

const getSendMessage = (extra: unknown) =>
  (extra as FeaturesThunkApi).sendMessage

export const loadFeatures = createAsyncThunk<
  GetFeaturesResponse,
  void,
  { extra: FeaturesThunkApi; rejectValue: string }
>("features/load", async (_, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "get-features",
    })) as GetFeaturesResponse | { error?: string }

    if ("error" in response && response.error) {
      return rejectWithValue(response.error)
    }

    return response as GetFeaturesResponse
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to load features",
    )
  }
})

export const updateFeatureConfig = createAsyncThunk<
  { featureId: string; config: Record<string, unknown> },
  { featureId: string; config: Record<string, unknown> },
  { extra: FeaturesThunkApi; rejectValue: string }
>(
  "features/updateConfig",
  async ({ featureId, config }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "update-feature-config",
        featureId,
        config,
      })) as UpdateFeatureConfigResponse & { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return { featureId, config: response.config }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update feature",
      )
    }
  },
)

export const executeFeatureAction = createAsyncThunk<
  { featureId: string; feature?: FeatureDescriptor },
  {
    featureId: string
    actionId: string
    payload?: Record<string, string | number | boolean>
  },
  { extra: FeaturesThunkApi; rejectValue: string }
>(
  "features/executeAction",
  async ({ featureId, actionId, payload }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "execute-feature-action",
        featureId,
        actionId,
        payload,
      })) as ExecuteFeatureActionResponse & { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      // The handler returns the re-projected descriptor so record-list rows
      // refresh after the mutation (save/rename/delete/pin) without a reload.
      return { featureId, feature: response.feature }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to run action",
      )
    }
  },
)

const setUpdating = (state: FeaturesState, id: string, isUpdating: boolean) => {
  if (isUpdating) {
    if (!state.updatingIds.includes(id)) {
      state.updatingIds.push(id)
    }
    return
  }
  state.updatingIds = state.updatingIds.filter((current) => current !== id)
}

export const featuresSlice = createSlice({
  name: "features",
  initialState,
  reducers: {
    clearFeaturesError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadFeatures.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadFeatures.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.features = action.payload.features
      })
      .addCase(loadFeatures.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? "Failed to load features"
      })
      .addCase(updateFeatureConfig.pending, (state, action) => {
        setUpdating(state, action.meta.arg.featureId, true)
      })
      .addCase(updateFeatureConfig.fulfilled, (state, action) => {
        setUpdating(state, action.payload.featureId, false)
        const index = state.features.findIndex(
          (feature) => feature.id === action.payload.featureId,
        )
        if (index !== -1) {
          state.features[index].config = action.payload.config
        }
      })
      .addCase(updateFeatureConfig.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.featureId, false)
        state.error = action.payload ?? "Failed to update feature"
      })
      .addCase(executeFeatureAction.fulfilled, (state, action) => {
        const updated = action.payload.feature
        if (!updated) {
          return
        }
        const index = state.features.findIndex(
          (feature) => feature.id === updated.id,
        )
        if (index !== -1) {
          state.features[index] = updated
        }
      })
      .addCase(executeFeatureAction.rejected, (state, action) => {
        state.error = action.payload ?? "Failed to run action"
      })
  },
})

export const { clearFeaturesError } = featuresSlice.actions

export const selectFeatures = (state: { features: FeaturesState }) =>
  state.features.features

export const selectFeaturesLoading = (state: { features: FeaturesState }) =>
  state.features.loading

export const selectFeaturesError = (state: { features: FeaturesState }) =>
  state.features.error

export const selectFeatureById =
  (id: string) => (state: { features: FeaturesState }) =>
    state.features.features.find((feature) => feature.id === id)

export default featuresSlice.reducer
