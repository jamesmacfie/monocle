// Architecture: background command system, extension-to-extension bridge. The
// DURABLE registry of approved peers' last-registered command trees. Unlike the
// site SDK's per-tab, session-only registry, a peer's MV3 worker sleeps, so
// Monocle must cache its tree to render the palette without waking it. Persisted
// under `monocle-extension-registrations` (keyed by extId) and mirrored in an
// in-memory cache the SYNCHRONOUS command loader reads. The cache is warmed once
// at startup (initExtensionRegistry) and kept in step on every register/dispose.
// Only approved peers' trees ever land here — the protocol handler rejects
// register from an unapproved sender, and revoke clears the peer's tree. See
// docs/extension-extension/architecture.md.
import type { ExternalRegistration } from "../../../shared/types"
import { createStorageArea } from "../../utils/storageArea"

export type ExtensionRegistrationEntry = {
  extId: string
  registrations: ExternalRegistration[]
  revision: number
  registeredAt: number
}

type ExtensionRegistrationStore = Record<string, ExtensionRegistrationEntry>

const area = createStorageArea<ExtensionRegistrationStore>({
  key: "monocle-extension-registrations",
  defaults: () => ({}),
  label: "extension registrations",
})

// In-memory mirror for the sync loader. Warmed by initExtensionRegistry.
const cache = new Map<string, ExtensionRegistrationEntry>()

export const initExtensionRegistry = async (): Promise<void> => {
  const store = await area.load()
  cache.clear()
  for (const entry of Object.values(store)) {
    cache.set(entry.extId, entry)
  }
}

export const getExtensionEntry = (
  extId: string,
): ExtensionRegistrationEntry | undefined => cache.get(extId)

export const getAllExtensionEntries = (): ExtensionRegistrationEntry[] =>
  Array.from(cache.values())

// Replace-whole: the peer's `register` is a full snapshot, like the site SDK's
// sync. Revisions advance on every write so search-index cache keys change.
export const setExtensionRegistrations = async (
  extId: string,
  registrations: ExternalRegistration[],
): Promise<ExtensionRegistrationEntry> => {
  const store = await area.update((current) => {
    const previous = current[extId]
    const entry: ExtensionRegistrationEntry = {
      extId,
      registrations,
      revision: (previous?.revision ?? 0) + 1,
      registeredAt: Date.now(),
    }
    return { ...current, [extId]: entry }
  })
  const entry = store[extId]
  cache.set(extId, entry)
  return entry
}

// Drop a peer's tree (dispose, or revoke of approval). Idempotent.
export const clearExtensionRegistrations = async (
  extId: string,
): Promise<void> => {
  await area.update((current) => {
    if (!(extId in current)) {
      return current
    }
    const next = { ...current }
    delete next[extId]
    return next
  })
  cache.delete(extId)
}

// Drop every peer's tree (e.g. the feature was turned off). Peers re-register
// when re-enabled.
export const clearAllExtensionRegistrations = async (): Promise<void> => {
  await area.save({})
  cache.clear()
}
