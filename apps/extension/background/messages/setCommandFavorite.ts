import type { SetCommandFavoriteMessage } from "../../shared/types"
import {
  addToFavoriteCommandIds,
  removeFromFavoriteCommandIds,
} from "../commands/favorites"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { createMessageHandler } from "../utils/messages"

const handleSetCommandFavorite = async ({
  id: commandId,
  favorite,
}: SetCommandFavoriteMessage) => {
  if (favorite) {
    await addToFavoriteCommandIds(commandId)
  } else {
    await removeFromFavoriteCommandIds(commandId)
  }

  invalidateSearchIndex()
  return { success: true }
}

export const setCommandFavorite = createMessageHandler(
  handleSetCommandFavorite,
  "Failed to set command favorite",
)
