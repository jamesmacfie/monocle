// Architecture: background feature layer. Transient per-feature runtime state,
// stored under `monocle-feature-state` keyed by feature id. This is the home
// for things like the active focus session — state with a different lifecycle
// from durable config (it is cleared when the session ends and is never
// exported). Kept separate from `monocle-feature-config` deliberately. See
// docs/features.md.
import { createStorageArea } from "../utils/storageArea"

type FeatureStateStore = Record<string, unknown>

const stateArea = createStorageArea<FeatureStateStore>({
  key: "monocle-feature-state",
  defaults: () => ({}),
  label: "feature state",
})

export const getFeatureState = async <TState>(
  featureId: string,
): Promise<TState | undefined> => {
  const store = await stateArea.load()
  return store[featureId] as TState | undefined
}

export const setFeatureState = async <TState>(
  featureId: string,
  state: TState,
): Promise<void> => {
  await stateArea.update((store) => ({ ...store, [featureId]: state }))
}

export const clearFeatureState = async (featureId: string): Promise<void> => {
  await stateArea.update((store) => {
    if (!(featureId in store)) {
      return store
    }
    const next = { ...store }
    delete next[featureId]
    return next
  })
}
