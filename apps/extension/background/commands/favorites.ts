import type { ActionCommandNode, Browser } from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { sendToastToActiveTab } from "../utils/browser"
import { createStorageArea } from "../utils/storageArea"

const STORAGE_KEY = "monocle-favoriteCommandIds"

const favoritesArea = createStorageArea<string[]>({
  key: STORAGE_KEY,
  defaults: () => [],
  label: "favorite command IDs",
})

// Add a command to favorites
export const addToFavoriteCommandIds = async (
  commandId: string,
): Promise<void> => {
  await favoritesArea.update((ids) =>
    ids.includes(commandId) ? ids : [...ids, commandId],
  )
}

// Remove a command from favorites
export const removeFromFavoriteCommandIds = async (
  commandId: string,
): Promise<void> => {
  await favoritesArea.update((ids) => ids.filter((id) => id !== commandId))
}

// Toggle favorite status. The whole decide-and-write cycle runs inside one
// locked update (the lock is not re-entrant), so concurrent toggles can't both
// read the same stale list.
export const toggleFavoriteCommandId = async (
  commandId: string,
): Promise<boolean> => {
  let added = false
  await favoritesArea.update((ids) => {
    if (ids.includes(commandId)) {
      return ids.filter((id) => id !== commandId)
    }
    added = true
    return [...ids, commandId]
  })
  return added
}

export const getFavoriteCommandIds = async (): Promise<string[]> =>
  favoritesArea.load()

export const isCommandFavorite = async (
  commandId: string,
): Promise<boolean> => {
  const favoriteCommandIds = await favoritesArea.load()
  return favoriteCommandIds.includes(commandId)
}

// Toggle favorite command that can be used as an action
export const toggleFavoriteCommand: ActionCommandNode = {
  type: "action",
  id: "toggle-favorite",
  name: "Toggle Favorite",
  description: "Toggle favorite status for a command",
  icon: { type: "lucide", name: "Star" },
  color: "amber",
  execute: async (
    _context?: Browser.Context,
    values?: Record<string, string>,
  ) => {
    const commandId = values?.commandId
    if (commandId) {
      await toggleFavoriteCommandId(commandId)
    }
  },
}

// Clear favorites command. Uses a direct remove (not favoritesArea.remove) so a
// storage failure surfaces to the user as an error toast — the storage-area
// helpers deliberately swallow write errors.
export const clearFavoritesCommand: ActionCommandNode = {
  type: "action",
  id: "clear-favorites",
  name: "Clear favorites",
  description: "Clear all favorite commands",
  icon: { type: "lucide", name: "Trash2" },
  execute: async () => {
    const b = getBrowserAPI()
    try {
      await b.storage.local.remove(STORAGE_KEY)

      // Send success notification
      await sendToastToActiveTab(
        "success",
        "Favorite commands cleared successfully",
      )
    } catch (error) {
      console.error("Failed to clear favorite commands:", error)

      // Send error notification
      await sendToastToActiveTab("error", "Failed to clear favorite commands")
    }
  },
}
