// Architecture: background layer. A small factory over a single
// `chrome.storage.local` key, collapsing the load/parse/default/catch and
// set/catch boilerplate that every storage module (favorites, snippets, usage,
// feature config/state, user scripts, ...) was hand-rolling. Each module keeps
// its own domain API (CRUD, merge, validation, broadcast); this only owns the
// transport.
//
// `update` is the read-modify-write primitive: it runs the mutator inside
// `withStorageLock(key, ...)` so concurrent handlers cannot interleave between
// load and save and silently lose writes. As with the lock, `update` is NOT
// re-entrant — a mutator must not call another `update`/locked write on the
// same area, or both deadlock. Keep the whole decide-and-write cycle inside one
// mutator.
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { withStorageLock } from "./storageMutex"

export type StorageArea<T> = {
  /** The backing storage key (also the lock key). */
  readonly key: string
  /** Read the value, falling back to a fresh default on miss or read error. */
  load: () => Promise<T>
  /** Replace the whole value. Swallows write errors (logged), like the modules it replaces. */
  save: (value: T) => Promise<void>
  /** Locked read-modify-write. Returns the value the mutator produced. */
  update: (mutate: (current: T) => T | Promise<T>) => Promise<T>
  /** Remove the key entirely (resets to default on next load). */
  remove: () => Promise<void>
}

type CreateStorageAreaOptions<T> = {
  key: string
  // A factory (not a value) so each load/default gets its own array/object and
  // callers can never mutate a shared default.
  defaults: () => T
  // Human-readable name for error logs; defaults to the key.
  label?: string
}

export function createStorageArea<T>({
  key,
  defaults,
  label,
}: CreateStorageAreaOptions<T>): StorageArea<T> {
  const name = label ?? key

  const load = async (): Promise<T> => {
    try {
      const result = (await getBrowserAPI().storage.local.get(key)) as Record<
        string,
        T | undefined
      >
      return result[key] ?? defaults()
    } catch (error) {
      console.error(`[storage] Failed to load ${name}:`, error)
      return defaults()
    }
  }

  const save = async (value: T): Promise<void> => {
    try {
      await getBrowserAPI().storage.local.set({ [key]: value })
    } catch (error) {
      console.error(`[storage] Failed to save ${name}:`, error)
    }
  }

  const update = (mutate: (current: T) => T | Promise<T>): Promise<T> =>
    withStorageLock(key, async () => {
      const next = await mutate(await load())
      await save(next)
      return next
    })

  const remove = async (): Promise<void> => {
    try {
      await getBrowserAPI().storage.local.remove(key)
    } catch (error) {
      console.error(`[storage] Failed to clear ${name}:`, error)
    }
  }

  return { key, load, save, update, remove }
}
