import type { ActionCommandNode, Browser } from "../../types/"
import { getActiveTab } from "../utils/browser"

const STORAGE_KEY = "monocle-favoriteCommandIds"

// Load favorite command IDs from storage
const loadFavoriteCommandIds = async (): Promise<string[]> => {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    const favoriteIds = result[STORAGE_KEY] || []

    return favoriteIds
  } catch (error) {
    console.error("Failed to load favorite command IDs:", error)
    return []
  }
}

// Save favorite command IDs to storage
const saveFavoriteCommandIds = async (commandIds: string[]): Promise<void> => {
  try {
    await browser.storage.local.set({
      [STORAGE_KEY]: commandIds,
    })
  } catch (error) {
    console.error("Failed to save favorite command IDs:", error)
  }
}

// Add a command to favorites
export const addToFavoriteCommandIds = async (
  commandId: string,
): Promise<void> => {
  const favoriteCommandIds = await loadFavoriteCommandIds()

  // Don't add if it already exists
  if (!favoriteCommandIds.includes(commandId)) {
    favoriteCommandIds.push(commandId)
    await saveFavoriteCommandIds(favoriteCommandIds)
  }
}

// Remove a command from favorites
export const removeFromFavoriteCommandIds = async (
  commandId: string,
): Promise<void> => {
  const favoriteCommandIds = await loadFavoriteCommandIds()
  const index = favoriteCommandIds.indexOf(commandId)

  if (index !== -1) {
    favoriteCommandIds.splice(index, 1)
    await saveFavoriteCommandIds(favoriteCommandIds)
  }
}

// Toggle favorite status
export const toggleFavoriteCommandId = async (
  commandId: string,
): Promise<boolean> => {
  const favoriteCommandIds = await loadFavoriteCommandIds()
  const isFavorite = favoriteCommandIds.includes(commandId)

  if (isFavorite) {
    await removeFromFavoriteCommandIds(commandId)
    return false
  } else {
    await addToFavoriteCommandIds(commandId)
    return true
  }
}

export const getFavoriteCommandIds = async (): Promise<string[]> => {
  const favoriteIds = await loadFavoriteCommandIds()
  return favoriteIds
}

export const isCommandFavorite = async (
  commandId: string,
): Promise<boolean> => {
  const favoriteCommandIds = await loadFavoriteCommandIds()
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
  doNotAddToRecents: true,
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

// Clear favorites command
export const clearFavoritesCommand: ActionCommandNode = {
  type: "action",
  id: "clear-favorites",
  name: "Clear favorites",
  description: "Clear all favorite commands",
  icon: { type: "lucide", name: "Trash2" },
  doNotAddToRecents: true,
  execute: async () => {
    try {
      await browser.storage.local.remove(STORAGE_KEY)

      // Send success notification
      const activeTab = await getActiveTab()

      if (activeTab) {
        browser.tabs.sendMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success",
          message: "Favorite commands cleared successfully",
        })
      }
    } catch (error) {
      console.error("Failed to clear favorite commands:", error)

      // Send error notification
      const activeTab = await getActiveTab()
      if (activeTab?.id) {
        browser.tabs.sendMessage(activeTab.id, {
          type: "monocle-alert",
          level: "error",
          message: "Failed to clear favorite commands",
        })
      }
    }
  },
}
