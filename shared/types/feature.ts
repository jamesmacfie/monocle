// Architecture: shared/ type layer. UI-safe projection of a feature module
// (background/features/types.ts holds the executable FeatureModule, which never
// crosses into the UI). A FeatureDescriptor is data only — schema + current
// config — served to the options page by the `get-features` message. The
// settings schema reuses the FormField union from ./ui so features and palette
// forms share one field vocabulary. See docs/features.md.
import type { CommandIcon } from "./commands"
import type { FormField } from "./ui"

export type FeatureSettingsSection = {
  title?: string
  description?: string
  fields: FormField[]
}

export type FeatureSettingsActionStyle = "default" | "primary" | "danger"

export type FeatureSettingsAction = {
  id: string
  label: string
  style?: FeatureSettingsActionStyle
}

export type FeatureSettingsSchema = {
  sections: FeatureSettingsSection[]
  actions?: FeatureSettingsAction[]
}

// Data-only projection of a feature for the options UI. No functions.
export type FeatureDescriptor = {
  id: string
  name: string
  description?: string
  icon?: CommandIcon
  schema?: FeatureSettingsSchema
  // Persisted config merged over the feature's defaults.
  config: Record<string, unknown>
  hasSettings: boolean
}

export type GetFeaturesResponse = {
  features: FeatureDescriptor[]
}

export type UpdateFeatureConfigResponse = {
  success: boolean
  config: Record<string, unknown>
}

export type ExecuteFeatureActionResponse = {
  success: boolean
}
