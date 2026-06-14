// Architecture: background layer. The generic Surfaces store — the single
// owner of persistent, declarative UI surfaces (overlays/badges) that
// content/new-tab render via SurfaceHost. Owner-namespaced under
// `monocle-surfaces` (persisted so surfaces survive MV3 service-worker death
// within a session). Any owner — a feature (e.g. "focus-mode") or a
// user-script automation ("userscript:<id>") — pushes surfaces here; every
// mutation broadcasts monocle-surfaces-changed so open tabs re-query. URL
// gating reuses matchesUrlPattern. See docs/surfaces.md.
import type { Surface } from "../shared/types"
import { validateSurface } from "../shared/types"
import { getBrowserAPI } from "../shared/utils/extension-api"
import { broadcastToAllTabs } from "./utils/browserTabs"
import { withStorageLock } from "./utils/storageMutex"
import { matchesUrlPattern } from "./utils/urlFilter"

const browserAPI = getBrowserAPI()

const STORAGE_KEY = "monocle-surfaces"

// Per-session owners are prefixed so a fresh browser session starts with no
// leftover surfaces, like toasts. Automations use `userscript:<id>`; commands
// that trigger a surface use `command:<id>` (e.g. a QR modal). Feature owners
// are NOT session-prefixed — they rebuild their own surfaces from durable state
// in their init() hook.
const SESSION_OWNER_PREFIXES = ["userscript:", "command:"]

const isSessionOwner = (ownerId: string): boolean =>
  SESSION_OWNER_PREFIXES.some((prefix) => ownerId.startsWith(prefix))

type SurfaceStore = Record<string, Surface[]>

const loadStore = async (): Promise<SurfaceStore> => {
  try {
    const result = (await browserAPI.storage.local.get(STORAGE_KEY)) as Record<
      string,
      SurfaceStore | undefined
    >
    return result[STORAGE_KEY] || {}
  } catch (error) {
    console.error("[surfaces] Failed to load surfaces:", error)
    return {}
  }
}

const saveStore = async (store: SurfaceStore): Promise<void> => {
  try {
    await browserAPI.storage.local.set({ [STORAGE_KEY]: store })
  } catch (error) {
    console.error("[surfaces] Failed to save surfaces:", error)
  }
}

const broadcastChanged = async (): Promise<void> => {
  await broadcastToAllTabs({ type: "monocle-surfaces-changed" })
}

// Validate surfaces against the canonical schema before they enter the store.
// This closes the silent-accept gap: features and command-owned surfaces were
// previously trusted, while only user-scripts were validated. Invalid surfaces
// are logged and skipped (fail-quiet, mirroring the content-block posture)
// rather than corrupting the store.
const validateSurfaces = (surfaces: Surface[], ownerId: string): Surface[] => {
  const valid: Surface[] = []
  for (const surface of surfaces) {
    const parsed = validateSurface(surface)
    if (parsed) {
      valid.push(parsed)
    } else {
      console.error(
        `[surfaces] Dropped invalid surface for owner "${ownerId}":`,
        surface,
      )
    }
  }
  return valid
}

/** Replaces all of an owner's surfaces (the common feature path). */
export const setOwnerSurfaces = async (
  ownerId: string,
  surfaces: Surface[],
): Promise<void> => {
  const valid = validateSurfaces(surfaces, ownerId)
  await withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    if (valid.length === 0) {
      delete store[ownerId]
    } else {
      store[ownerId] = valid
    }
    await saveStore(store)
  })
  await broadcastChanged()
}

export const clearOwnerSurfaces = async (ownerId: string): Promise<void> => {
  await withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    if (!(ownerId in store)) {
      return
    }
    delete store[ownerId]
    await saveStore(store)
  })
  await broadcastChanged()
}

/** Adds or replaces one surface (by id) within an owner — the automation path. */
export const upsertSurface = async (
  ownerId: string,
  surface: Surface,
): Promise<void> => {
  const [valid] = validateSurfaces([surface], ownerId)
  if (!valid) {
    return
  }
  await withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    const existing = store[ownerId] ?? []
    const next = existing.filter((entry) => entry.id !== valid.id)
    next.push(valid)
    store[ownerId] = next
    await saveStore(store)
  })
  await broadcastChanged()
}

export const removeSurface = async (
  ownerId: string,
  surfaceId: string,
): Promise<void> => {
  await withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    const existing = store[ownerId]
    if (!existing) {
      return
    }
    const next = existing.filter((entry) => entry.id !== surfaceId)
    if (next.length === 0) {
      delete store[ownerId]
    } else {
      store[ownerId] = next
    }
    await saveStore(store)
  })
  await broadcastChanged()
}

/** True when a surface's urlMatch admits this URL (absent gate = always). */
const surfaceMatchesUrl = (surface: Surface, url: string): boolean => {
  const rules = surface.urlMatch
  if (!rules) {
    return true
  }
  if (rules.denyUrls?.length && matchesUrlPattern(url, rules.denyUrls)) {
    return false
  }
  if (rules.allowUrls?.length) {
    return matchesUrlPattern(url, rules.allowUrls)
  }
  return true
}

/**
 * Every surface (across all owners) whose urlMatch admits the given URL. Each
 * returned surface is stamped with its `ownerId` so the host can target it in a
 * `surface-action` (e.g. dismiss) — the stored shape stays owner-namespaced.
 */
export const getSurfacesForUrl = async (url: string): Promise<Surface[]> => {
  const store = await loadStore()
  const surfaces: Surface[] = []
  for (const [ownerId, ownerSurfaces] of Object.entries(store)) {
    for (const surface of ownerSurfaces) {
      if (surfaceMatchesUrl(surface, url)) {
        surfaces.push({ ...surface, ownerId })
      }
    }
  }
  return surfaces
}

/**
 * Startup cleanup: drop per-session (automation) surfaces so a new browser
 * session begins clean. Feature owners rebuild their surfaces from durable
 * state in their own init() hook. Called once from background/index.ts.
 */
export const initSurfaces = async (): Promise<void> => {
  await withStorageLock(STORAGE_KEY, async () => {
    const store = await loadStore()
    let changed = false
    for (const ownerId of Object.keys(store)) {
      if (isSessionOwner(ownerId)) {
        delete store[ownerId]
        changed = true
      }
    }
    if (changed) {
      await saveStore(store)
    }
  })
}
