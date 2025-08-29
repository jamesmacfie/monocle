import type { GetChildrenMessage } from "../../types"
import {
  commandsToSuggestions,
  findCommand,
  getCommands as getCommandsFromBackground,
} from "../commands"
import { resolveCommandName } from "../utils/commands"
import { createMessageHandler } from "../utils/messages"

const handleGetChildrenCommands = async (message: GetChildrenMessage) => {
  const {
    favorites: cmdFavorites,
    suggestions: cmdSuggestions,
    recents: cmdRecents,
  } = await getCommandsFromBackground()
  const allCommands = [...cmdFavorites, ...cmdRecents, ...cmdSuggestions]

  // Use findCommand to search recursively through nested structures
  const parentCommand = await findCommand(
    allCommands,
    message.id,
    message.context,
  )

  if (parentCommand && "commands" in parentCommand) {
    const children = await parentCommand.commands(message.context)
    const parentNameString = await resolveCommandName(
      parentCommand.name,
      message.context,
    )
    const childSuggestions = await commandsToSuggestions(
      children,
      message.context,
      parentNameString,
    )

    return { children: childSuggestions }
  }

  return { children: [] }
}

export const getChildrenCommands = createMessageHandler(
  handleGetChildrenCommands,
  "Failed to get command children",
)
