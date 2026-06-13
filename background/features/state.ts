// Architecture: background feature layer. Transient per-feature runtime state,
// stored under `monocle-feature-state` keyed by feature id. This is the home
// for things like the active focus session — state with a different lifecycle
// from durable config (it is cleared when the session ends and is never
// exported). Kept separate from `monocle-feature-config` deliberately. See
// docs/features.md.
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { withStorageLock } from "../utils/storageMutex"

const browserAPI = getBrowserAPI()

const STORAGE_KEY = "monocle-feature-state"

type FeatureStateStore = Record<string, unknown>

const loadStore = async (): Promise<FeatureStateStore> => {
  try {
    const result = (await browserAPI.storage.local.get(STORAGE_KEY)) as Record<
      string,
      FeatureStateStore | undefined
    >
    return result[STORAGE_KEY] || {}
  } catch (error) {
    console.error("[features] Failed to load feature state:", error)
    return {}
  }
}

const saveStore = async (store: FeatureStateStore): Promise<void> => {
  try {
    await browserAPI.storage.local.set({ [STORAGE_KEY]: store })
  } catch (error) {
    console.error("[features] Failed to save feature state:", error)
  }
}

export const getFeatureState = async <TState>(
  featureId: string,
): Promise<TState | undefined> => {
  const store = await loadStore()
  return store[featureId] as TState | undefined
}

export const setFeatureState = async <TState>(
  featureId: string,
  state: TState,
): Promise<void> =>
  withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    store[featureId] = state
    await saveStore(store)
  })

export const clearFeatureState = async (featureId: string): Promise<void> =>
  withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    if (featureId in store) {
      delete store[featureId]
      await saveStore(store)
    }
  })
