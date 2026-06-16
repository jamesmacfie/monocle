// Architecture: background feature layer. Durable per-feature user config,
// stored under `monocle-feature-config` keyed by feature id. Distinct from
// command settings (`monocle-settings`) and from transient runtime state
// (`monocle-feature-state`). Config is replace-whole on write — the options
// settings page is its single writer — so there is no merge-branch complexity
// like CommandSettings.urlRules needs. See docs/features.md.
import { createStorageArea } from "../utils/storageArea"

type FeatureConfigStore = Record<string, Record<string, unknown>>

const configArea = createStorageArea<FeatureConfigStore>({
  key: "monocle-feature-config",
  defaults: () => ({}),
  label: "feature config",
})

// Raw persisted config for a feature (without defaults applied).
export const getStoredFeatureConfig = async (
  featureId: string,
): Promise<Record<string, unknown> | undefined> => {
  const store = await configArea.load()
  return store[featureId]
}

// Persisted config merged over the supplied defaults.
export const getFeatureConfig = async <TConfig extends Record<string, unknown>>(
  featureId: string,
  defaults: TConfig,
): Promise<TConfig> => {
  const stored = await getStoredFeatureConfig(featureId)
  return { ...defaults, ...(stored || {}) }
}

// Replace-whole write. Validation happens at the message boundary against the
// feature's configSchema before this is called.
export const setFeatureConfig = async (
  featureId: string,
  config: Record<string, unknown>,
): Promise<void> => {
  await configArea.update((store) => ({ ...store, [featureId]: config }))
}
