// Architecture: background feature layer. Durable per-feature user config,
// stored under `monocle-feature-config` keyed by feature id. Distinct from
// command settings (`monocle-settings`) and from transient runtime state
// (`monocle-feature-state`). Config is replace-whole on write — the options
// settings page is its single writer — so there is no merge-branch complexity
// like CommandSettings.urlRules needs. See docs/features.md.
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { withStorageLock } from "../utils/storageMutex"

const browserAPI = getBrowserAPI()

const STORAGE_KEY = "monocle-feature-config"

type FeatureConfigStore = Record<string, Record<string, unknown>>

const loadStore = async (): Promise<FeatureConfigStore> => {
  try {
    const result = (await browserAPI.storage.local.get(STORAGE_KEY)) as Record<
      string,
      FeatureConfigStore | undefined
    >
    return result[STORAGE_KEY] || {}
  } catch (error) {
    console.error("[features] Failed to load feature config:", error)
    return {}
  }
}

const saveStore = async (store: FeatureConfigStore): Promise<void> => {
  try {
    await browserAPI.storage.local.set({ [STORAGE_KEY]: store })
  } catch (error) {
    console.error("[features] Failed to save feature config:", error)
  }
}

// Raw persisted config for a feature (without defaults applied).
export const getStoredFeatureConfig = async (
  featureId: string,
): Promise<Record<string, unknown> | undefined> => {
  const store = await loadStore()
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
): Promise<void> =>
  withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    store[featureId] = config
    await saveStore(store)
  })
