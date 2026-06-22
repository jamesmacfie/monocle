// Architecture: background feature layer. The executable FeatureModule — held
// only in the background because it carries functions and a Zod schema. The
// UI-safe projection is FeatureDescriptor (shared/types/feature.ts), produced
// by the registry. A feature contributes palette commands, an optional
// declarative settings page (schema + config validation + action handlers),
// and an optional startup lifecycle hook. See docs/features.md.
import type { z } from "zod"
import type {
  Automation,
  Browser,
  CommandIcon,
  CommandNode,
  PickedElement,
} from "../../shared/types"
import type {
  FeatureActionPayload,
  FeatureSettingsSchema,
  RecordListItem,
} from "../../shared/types/feature"

// Context handed to a settings-page action handler. Kept minimal; grows as
// features need it. `payload` carries record-list row data (itemId/childId/…).
// `selection`/`tab` are populated when the action originates from a surface
// gesture (e.g. a `picker` reporting a clicked element via surface-action)
// rather than a settings-page button.
export type FeatureActionContext = {
  context?: Browser.Context
  payload?: FeatureActionPayload
  selection?: PickedElement
  tab?: { id: number; url?: string }
}

export type FeatureSettings<TConfig> = {
  // Rendered by the options-page SchemaForm. Reuses the FormField union.
  schema: FeatureSettingsSchema
  // Validates an incoming config payload at the message boundary.
  configSchema: z.ZodType<TConfig>
  // Applied as the base under any persisted config.
  defaults: TConfig
  // Projects derived display rows for `record-list` fields, keyed by field id.
  // The raw config shape differs from a row's {id,label,sublabel}, so a feature
  // maps it here. Read into FeatureDescriptor.lists by the registry. Optional.
  lists?: (
    config: TConfig,
  ) =>
    | Record<string, RecordListItem[]>
    | Promise<Record<string, RecordListItem[]>>
  // Settings-page action buttons (Start/Stop/etc) and record-list row actions.
  handleAction?: (
    actionId: string,
    ctx: FeatureActionContext,
  ) => void | Promise<void>
  // Called after a validated config is persisted, so a feature can react
  // (e.g. broadcast to tabs that its config changed). Optional.
  onConfigChange?: (config: TConfig) => void | Promise<void>
}

export type FeatureModule<TConfig = Record<string, unknown>> = {
  id: string
  name: string
  description?: string
  icon?: CommandIcon
  // When true, the generic options Features page does not list this feature —
  // its UI lives on a bespoke page instead (e.g. the native bridge on the
  // Integrations page). The module still registers commands/config/lifecycle.
  hiddenFromFeaturesPage?: boolean
  // Synchronous so it composes into the sync command loader (source.ts).
  // Runtime state surfaces through async name/description resolvers on the
  // returned nodes, not here.
  commands: (context?: Browser.Context) => CommandNode[]
  settings?: FeatureSettings<TConfig>
  // Startup lifecycle: re-arm alarms / register listeners after a SW restart.
  init?: () => void | Promise<void>
  // Read-only automations PROJECTED from this feature's config. They flow
  // through the same automation engine/trigger system as user documents
  // (merged in by background/automations/registry.ts) but are never stored.
  // Each must validate against AutomationSchema and carry owner:{kind:"feature"}
  // with a deterministic id (featureAutomationId). See docs/features.md.
  automations?: (config: TConfig) => Automation[] | Promise<Automation[]>
}
