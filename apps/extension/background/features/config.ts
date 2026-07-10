// Architecture: background feature layer. Durable per-feature user config,
// stored under `monocle-feature-config` keyed by feature id. Distinct from
// command settings (`monocle-settings`) and from transient runtime state
// (`monocle-feature-state`). Config has multiple writers: replace freshly
// validated whole documents with setFeatureConfig; all read-modify-write paths
// must use the locked updateFeatureConfig helper. See docs/features.md.
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

// Locked read-modify-write of one feature's config. The mutator receives the
// persisted config merged over `defaults` and returns the full next config
// (replace-whole per feature). NOT re-entrant: the mutator must not call
// setFeatureConfig/updateFeatureConfig. Throwing aborts without writing.
export const updateFeatureConfig = async <
  TConfig extends Record<string, unknown>,
>(
  featureId: string,
  defaults: TConfig,
  mutate: (config: TConfig) => TConfig,
): Promise<TConfig> => {
  const nextStore = await configArea.update((store) => {
    const current = { ...defaults, ...(store[featureId] || {}) } as TConfig
    const next = mutate(current)
    return { ...store, [featureId]: next }
  })
  return { ...defaults, ...(nextStore[featureId] || {}) } as TConfig
}
