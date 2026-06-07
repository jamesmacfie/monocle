import type { GetCommandsMessage } from "../../shared/types"
import {
  commandsToSuggestions,
  getCommands as getCommandsFromBackground,
} from "../commands"
import { createMessageHandler } from "../utils/messages"

// Serves the root empty state only: favorites and usage-ranked suggestions.
// Deep-search items are no longer flattened here — searching is handled by
// the search-commands message against the background search index.
const handleGetCommands = async (message: GetCommandsMessage) => {
  const { favorites: cmdFavorites, suggestions: cmdSuggestions } =
    await getCommandsFromBackground(message.context)

  const favorites = await commandsToSuggestions(cmdFavorites, message.context)
  const suggestions = await commandsToSuggestions(
    cmdSuggestions,
    message.context,
  )

  return { favorites, suggestions }
}

export const getCommands = createMessageHandler(
  handleGetCommands,
  "Failed to get command suggestions",
)
