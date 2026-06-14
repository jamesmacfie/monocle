// Architecture: background feature registry. The single seam where feature
// modules are registered and projected. Features contribute palette commands
// (added in background/commands/source.ts under the "features" category),
// a data-only descriptor for the options page (get-features), and a startup
// lifecycle hook (initFeatures, called from background/index.ts). The registry
// owns commands/config/state/lifecycle — it is deliberately NOT a message
// router; feature-specific runtime messages live with the feature. See
// docs/features.md.
import type {
  Browser,
  CommandNode,
  FeatureDescriptor,
} from "../../shared/types"
import { getFeatureConfig } from "./config"
import { focusFeature } from "./focus"
import { tabGroupsFeature } from "./tabGroups"
import type { FeatureModule } from "./types"

// Static registry. Promote to dynamic registration only once a second/third
// feature validates the shape (see docs/features.md).
const features: FeatureModule<any>[] = [focusFeature, tabGroupsFeature]

export const getFeatures = (): FeatureModule<any>[] => features

export const getFeatureById = (
  featureId: string,
): FeatureModule<any> | undefined =>
  features.find((feature) => feature.id === featureId)

// All feature-contributed palette commands. Called by the (sync) command
// loader, so this stays sync; runtime state shows through async node labels.
export const getFeatureCommands = (context?: Browser.Context): CommandNode[] =>
  features.flatMap((feature) => feature.commands(context))

// Data-only projection of a single feature for the options page. Config is
// merged over defaults; record-list rows are projected via settings.lists.
const projectFeatureDescriptor = async (
  feature: FeatureModule<any>,
): Promise<FeatureDescriptor> => {
  const config = feature.settings
    ? await getFeatureConfig(
        feature.id,
        feature.settings.defaults as Record<string, unknown>,
      )
    : {}

  const lists = feature.settings?.lists
    ? await feature.settings.lists(config)
    : undefined

  return {
    id: feature.id,
    name: feature.name,
    description: feature.description,
    icon: feature.icon,
    schema: feature.settings?.schema,
    config,
    lists,
    hasSettings: Boolean(feature.settings),
  }
}

// Data-only projection for the options page. Config is merged over defaults.
export const getFeatureDescriptors = async (): Promise<FeatureDescriptor[]> => {
  return Promise.all(features.map(projectFeatureDescriptor))
}

// Re-project one feature by id (used after a settings-page action mutates its
// config, so the UI can refresh without reloading every feature).
export const getFeatureDescriptor = async (
  featureId: string,
): Promise<FeatureDescriptor | undefined> => {
  const feature = getFeatureById(featureId)
  return feature ? projectFeatureDescriptor(feature) : undefined
}

// Startup lifecycle. Called once from background/index.ts.
export const initFeatures = async (): Promise<void> => {
  for (const feature of features) {
    if (feature.init) {
      try {
        await feature.init()
      } catch (error) {
        console.error(`[features] init failed for "${feature.id}":`, error)
      }
    }
  }
}
