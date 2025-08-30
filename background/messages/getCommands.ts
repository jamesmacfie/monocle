import type { GetCommandsMessage } from "../../types/"
import {
  commandsToSuggestions,
  getCommands as getCommandsFromBackground,
} from "../commands"
import { createMessageHandler } from "../utils/messages"

const handleGetCommands = async (message: GetCommandsMessage) => {
  console.debug("[GetCommands] Starting to get commands", message)

  const {
    favorites: cmdFavorites,
    recents: cmdRecents,
    suggestions: cmdSuggestions,
  } = await getCommandsFromBackground()
  console.debug("[GetCommands] Raw commands from background:", {
    favorites: cmdFavorites.length,
    recents: cmdRecents.length,
    suggestions: cmdSuggestions.length,
  })

  const favorites = await commandsToSuggestions(cmdFavorites, message.context)
  const recents = await commandsToSuggestions(cmdRecents, message.context)
  const suggestions = await commandsToSuggestions(
    cmdSuggestions,
    message.context,
  )

  const result = { favorites, recents, suggestions }
  console.debug("[GetCommands] Final result:", {
    favorites: result.favorites.length,
    recents: result.recents.length,
    suggestions: result.suggestions.length,
  })

  return result
}

export const getCommands = createMessageHandler(
  handleGetCommands,
  "Failed to get command suggestions",
)
