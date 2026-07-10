import { createSlice } from "@reduxjs/toolkit"
import type {
  ExecuteFeatureActionResponse,
  FeatureDescriptor,
  GetFeaturesResponse,
  UpdateFeatureConfigResponse,
} from "../../../shared/types"
import { createMessageThunk } from "../messageThunk"
import { toggleId } from "../updatingIds"

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

export const loadFeatures = createMessageThunk<
  GetFeaturesResponse,
  void,
  GetFeaturesResponse
>(
  "features/load",
  () => ({ type: "monocle-features-get" }),
  (response) => response,
  "Failed to load features",
)

export const updateFeatureConfig = createMessageThunk<
  { featureId: string; config: Record<string, unknown> },
  { featureId: string; config: Record<string, unknown> },
  UpdateFeatureConfigResponse
>(
  "features/updateConfig",
  ({ featureId, config }) => ({
    type: "monocle-feature-config-update",
    featureId,
    config,
  }),
  (response, { featureId }) => ({ featureId, config: response.config }),
  "Failed to update feature",
)

export const executeFeatureAction = createMessageThunk<
  { featureId: string; feature?: FeatureDescriptor },
  {
    featureId: string
    actionId: string
    payload?: Record<string, string | number | boolean>
  },
  ExecuteFeatureActionResponse
>(
  "features/executeAction",
  ({ featureId, actionId, payload }) => ({
    type: "monocle-feature-action-execute",
    featureId,
    actionId,
    payload,
  }),
  (response, { featureId }) => ({ featureId, feature: response.feature }),
  "Failed to run action",
)

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
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.featureId,
          true,
        )
      })
      .addCase(updateFeatureConfig.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.featureId,
          false,
        )
        const index = state.features.findIndex(
          (feature) => feature.id === action.payload.featureId,
        )
        if (index !== -1) {
          state.features[index].config = action.payload.config
        }
      })
      .addCase(updateFeatureConfig.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.featureId,
          false,
        )
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
