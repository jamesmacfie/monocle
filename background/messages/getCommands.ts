import type { GetCommandsMessage } from "../../shared/types"
import {
  commandsToSuggestions,
  getCommands as getCommandsFromBackground,
} from "../commands"
import { createMessageHandler } from "../utils/messages"
import { flattenDeepSearchCommands } from "./getDeepSearchCommands"

const handleGetCommands = async (message: GetCommandsMessage) => {
  const { favorites: cmdFavorites, suggestions: cmdSuggestions } =
    await getCommandsFromBackground(message.context)

  const favorites = await commandsToSuggestions(cmdFavorites, message.context)
  const suggestions = await commandsToSuggestions(
    cmdSuggestions,
    message.context,
  )

  const deepSearchItems = await flattenDeepSearchCommands(
    cmdSuggestions,
    message.context,
  )

  const result = { favorites, suggestions, deepSearchItems }

  return result
}

export const getCommands = createMessageHandler(
  handleGetCommands,
  "Failed to get command suggestions",
)
