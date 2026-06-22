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

// One row in a `record-list` field. Display data only (the underlying record
// stays in the feature's config); actions reference it by `id`. `children` are
// nested rows (e.g. the tabs inside a saved group) shown when the row expands.
export type RecordListItem = {
  id: string
  label: string
  sublabel?: string
  children?: RecordListItem[]
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
  // Derived display rows for `record-list` fields, keyed by field id. Projected
  // by the feature from its config (raw config shape ≠ row shape).
  lists?: Record<string, RecordListItem[]>
  hasSettings: boolean
  // Mirrors FeatureModule.hiddenFromFeaturesPage: the generic Features page
  // filters these out (their UI lives on a bespoke page, e.g. Integrations).
  hiddenFromFeaturesPage?: boolean
}

// Payload sent with a record-list action: identifies the group row (`itemId`),
// an optional child row (`childId`), an edited value (`value`, for rename), or
// any feature-specific scalars (e.g. `pinned`).
export type FeatureActionPayload = Record<string, string | number | boolean>

export type GetFeaturesResponse = {
  features: FeatureDescriptor[]
}

export type UpdateFeatureConfigResponse = {
  success: boolean
  config: Record<string, unknown>
}

export type ExecuteFeatureActionResponse = {
  success: boolean
  // The re-projected descriptor after the action ran, so the options page can
  // refresh record-list rows without a second round trip.
  feature?: FeatureDescriptor
}
