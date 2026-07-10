// Architecture: background feature registry. The single seam where feature
// modules are registered and projected. Features contribute palette commands
// (added in background/commands/source.ts under the "features" category),
// a data-only descriptor for the options page (get-features), and a startup
// lifecycle hook (initFeatures, called from background/index.ts). The registry
// owns commands/config/state/lifecycle — it is deliberately NOT a message
// router; feature-specific runtime messages live with the feature. See
// docs/features.md.
import type {
  Automation,
  Browser,
  CommandNode,
  FeatureDescriptor,
} from "../../shared/types"
import { AutomationSchema } from "../../shared/types/automationValidation"
import { getFeatureConfig } from "./config"
import { elementHiderFeature } from "./elementHider"
import { extensionRegistryFeature } from "./extensionRegistry"
import { focusFeature } from "./focus"
import { nativeMessagingFeature } from "./nativeMessaging"
import { tabGroupsFeature } from "./tabGroups"
import type { FeatureModule } from "./types"

// Static registry. Promote to dynamic registration only once a second/third
// feature validates the shape (see docs/features.md).
const features: FeatureModule<any>[] = [
  focusFeature,
  tabGroupsFeature,
  elementHiderFeature,
  nativeMessagingFeature,
  extensionRegistryFeature,
]

export const getFeatures = (): FeatureModule<any>[] => features

export const getFeatureById = (
  featureId: string,
): FeatureModule<any> | undefined =>
  features.find((feature) => feature.id === featureId)

// All feature-contributed palette commands. Called by the (sync) command
// loader, so this stays sync; runtime state shows through async node labels.
export const getFeatureCommands = (context?: Browser.Context): CommandNode[] =>
  features.flatMap((feature) => feature.commands(context))

export const validateFeatureAutomations = (
  featureId: string,
  automations: Automation[],
): Automation[] => {
  const valid: Automation[] = []

  for (const automation of automations) {
    const parsed = AutomationSchema.safeParse(automation)
    if (parsed.success) {
      valid.push(parsed.data)
      continue
    }

    console.error(
      `[features] invalid projected automation skipped for "${featureId}":`,
      {
        automationId: automation.id,
        issues: parsed.error.issues,
      },
    )
  }

  return valid
}

// Read-only automations projected from every feature's current config. Merged
// with stored user documents by background/automations/registry.ts so they run
// through the same engine + trigger system. Projection failures are logged and
// skipped — a broken feature never takes down the user's automations.
export const getFeatureAutomations = async (): Promise<Automation[]> => {
  const projected: Automation[] = []
  for (const feature of features) {
    if (!feature.automations) {
      continue
    }
    if (!feature.settings) {
      console.error(
        `[features] "${feature.id}" declares automations but no settings (defaults are required to project config); skipping`,
      )
      continue
    }
    try {
      const config = await getFeatureConfig(
        feature.id,
        feature.settings.defaults as Record<string, unknown>,
      )
      projected.push(
        ...validateFeatureAutomations(
          feature.id,
          await feature.automations(config),
        ),
      )
    } catch (error) {
      console.error(
        `[features] automations projection failed for "${feature.id}":`,
        error,
      )
    }
  }
  return projected
}

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
    hiddenFromFeaturesPage: feature.hiddenFromFeaturesPage,
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
