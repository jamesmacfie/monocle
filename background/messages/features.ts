// Architecture: background message layer. The generic feature-module messages:
// project descriptors for the options page, persist validated config, and run
// settings-page actions. Feature-specific runtime messages (e.g. Focus Mode's
// get-surfaces) live with their feature, not here. See docs/features.md.
import type {
  ExecuteFeatureActionMessage,
  GetFeaturesMessage,
  UpdateFeatureConfigMessage,
} from "../../shared/types"
import {
  getFeatureById,
  getFeatureDescriptor,
  getFeatureDescriptors,
} from "../features"
import { setFeatureConfig } from "../features/config"
import { createMessageHandler } from "../utils/messages"

const handleGetFeatures = async (_message: GetFeaturesMessage) => {
  return { features: await getFeatureDescriptors() }
}

const handleUpdateFeatureConfig = async (
  message: UpdateFeatureConfigMessage,
) => {
  const feature = getFeatureById(message.featureId)
  if (!feature?.settings) {
    throw new Error(`Unknown configurable feature: ${message.featureId}`)
  }

  const parsed = feature.settings.configSchema.safeParse(message.config)
  if (!parsed.success) {
    throw new Error(`Invalid feature config: ${parsed.error.message}`)
  }

  const config = parsed.data as Record<string, unknown>
  await setFeatureConfig(message.featureId, config)
  await feature.settings.onConfigChange?.(parsed.data)

  return { success: true, config }
}

const handleExecuteFeatureAction = async (
  message: ExecuteFeatureActionMessage,
) => {
  const feature = getFeatureById(message.featureId)
  if (!feature?.settings?.handleAction) {
    throw new Error(`Feature action not available: ${message.featureId}`)
  }

  await feature.settings.handleAction(message.actionId, {
    context: message.context,
    payload: message.payload,
  })

  // Re-project so the options page can refresh record-list rows (a row action
  // may have mutated this feature's config) without reloading every feature.
  const descriptor = await getFeatureDescriptor(message.featureId)
  return { success: true, feature: descriptor }
}

export const getFeatures = createMessageHandler(
  handleGetFeatures,
  "Failed to get features",
)

export const updateFeatureConfig = createMessageHandler(
  handleUpdateFeatureConfig,
  "Failed to update feature config",
)

export const executeFeatureAction = createMessageHandler(
  handleExecuteFeatureAction,
  "Failed to execute feature action",
)
