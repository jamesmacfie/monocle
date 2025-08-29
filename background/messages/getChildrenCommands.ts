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

  let commandToSearch = allCommands
  let parentCommand: any = null

  // If we have a parent path, navigate through it to find the correct context
  if (message.parentPath && message.parentPath.length > 0) {
    for (const parentId of message.parentPath) {
      parentCommand = await findCommand(
        commandToSearch,
        parentId,
        message.context,
      )

      if (parentCommand && "commands" in parentCommand) {
        // Get the children for the next level of search
        commandToSearch = await parentCommand.commands(message.context)
      } else {
        // If we can't find a parent in the path, something went wrong
        console.error(`Parent command ${parentId} not found in path`)
        return { children: [] }
      }
    }
  }

  // Now search for the target command in the correct context
  const targetCommand = await findCommand(
    commandToSearch,
    message.id,
    message.context,
  )

  if (targetCommand && "commands" in targetCommand) {
    const children = await targetCommand.commands(message.context)
    const parentNameString = await resolveCommandName(
      targetCommand.name,
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
