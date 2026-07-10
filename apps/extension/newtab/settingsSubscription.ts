type StorageChangeListener = (
  changes: Record<string, unknown>,
  areaName: string,
) => void

type StorageChangeEvent = {
  addListener: (listener: StorageChangeListener) => void
  removeListener: (listener: StorageChangeListener) => void
}

/** Subscribes to the canonical settings document used by the new-tab shell. */
export const subscribeToNewTabSettingsChanges = (
  event: StorageChangeEvent,
  onSettingsChanged: () => void,
): (() => void) => {
  const listener: StorageChangeListener = (changes, areaName) => {
    if (areaName === "local" && "monocle-settings" in changes) {
      onSettingsChanged()
    }
  }

  event.addListener(listener)
  return () => event.removeListener(listener)
}
