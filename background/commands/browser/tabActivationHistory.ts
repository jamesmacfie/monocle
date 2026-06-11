import { getBrowserAPI } from "../../../shared/utils/extension-api"
import { getTab } from "../../utils/browser"

const MAX_HISTORY_LENGTH = 50
const STORAGE_KEY = "monocle-tab-activation-history"

// In-memory working copy. MV3 service workers are killed after idle and
// restarted on demand, so this array alone would silently reset; it is
// hydrated lazily from chrome.storage.session (per-browser-session, survives
// worker restarts) and every mutation writes through.
const activatedTabIds: number[] = []

// Narrow local type: the bundled chrome typings don't expose the
// promise-returning overloads on storage.session that storage.local has.
type SessionStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (items: Record<string, unknown>) => Promise<void>
}

// storage.session is unavailable on older Firefox; degrade to in-memory only.
const getSessionStorage = (): SessionStorageArea | undefined =>
  (getBrowserAPI().storage as { session?: SessionStorageArea } | undefined)
    ?.session

const persist = (): void => {
  const session = getSessionStorage()
  if (!session) {
    return
  }

  session
    .set({ [STORAGE_KEY]: [...activatedTabIds] })
    .catch((error: unknown) => {
      console.warn("[TabActivationHistory] Failed to persist:", error)
    })
}

let hydrated: Promise<void> | null = null

const hydrate = async (): Promise<void> => {
  const session = getSessionStorage()
  if (!session) {
    return
  }

  try {
    const result = (await session.get(STORAGE_KEY)) as Record<
      string,
      unknown
    > | null
    const stored = result?.[STORAGE_KEY]

    // Only fill an empty array — never merge over newer in-memory state
    // recorded while hydration was in flight.
    if (activatedTabIds.length === 0 && Array.isArray(stored)) {
      activatedTabIds.push(
        ...stored.filter((id): id is number => typeof id === "number"),
      )
    }
  } catch (error) {
    console.warn("[TabActivationHistory] Failed to hydrate:", error)
  }
}

const ensureHydrated = (): Promise<void> => {
  hydrated ??= hydrate()
  return hydrated
}

export function recordActivatedTab(tabId: number): void {
  void ensureHydrated()

  const existingIndex = activatedTabIds.indexOf(tabId)
  if (existingIndex >= 0) {
    activatedTabIds.splice(existingIndex, 1)
  }

  activatedTabIds.push(tabId)

  if (activatedTabIds.length > MAX_HISTORY_LENGTH) {
    activatedTabIds.splice(0, activatedTabIds.length - MAX_HISTORY_LENGTH)
  }

  persist()
}

export function forgetActivatedTab(tabId: number): void {
  void ensureHydrated()

  const existingIndex = activatedTabIds.indexOf(tabId)
  if (existingIndex >= 0) {
    activatedTabIds.splice(existingIndex, 1)
    persist()
  }
}

export async function getPreviousActivatedTabId(
  currentTabId?: number,
): Promise<number | undefined> {
  await ensureHydrated()

  for (let index = activatedTabIds.length - 1; index >= 0; index -= 1) {
    const tabId = activatedTabIds[index]
    if (tabId === currentTabId) {
      continue
    }

    try {
      const tab = await getTab(tabId)
      if (tab?.id) {
        return tab.id
      }
    } catch (_error) {
      forgetActivatedTab(tabId)
    }
  }

  return undefined
}
