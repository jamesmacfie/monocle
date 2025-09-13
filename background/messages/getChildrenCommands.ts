import type {
  CommandNode,
  GetChildrenMessage,
  GroupCommandNode,
} from "../../shared/types"
import {
  commandsToSuggestions,
  findCommand,
  getCommands as getCommandsFromBackground,
} from "../commands"
import { resolveCommandName } from "../utils/commands"
import { createMessageHandler } from "../utils/messages"

const handleGetChildrenCommands = async (message: GetChildrenMessage) => {
  console.debug("[GetChildrenCommands] Starting with message:", message)

  const {
    favorites: cmdFavorites,
    suggestions: cmdSuggestions,
    recents: cmdRecents,
  } = await getCommandsFromBackground(message.context)
  const allCommands = [...cmdFavorites, ...cmdRecents, ...cmdSuggestions]

  console.debug(
    "[GetChildrenCommands] All commands found:",
    allCommands.length,
    allCommands.map((c) => c.id),
  )

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

      if (parentCommand && parentCommand.type === "group") {
        // Get the children for the next level of search
        commandToSearch = await (parentCommand as GroupCommandNode).children(
          message.context,
        )
      } else {
        // If we can't find a parent in the path, something went wrong
        console.error(`Parent command ${parentId} not found in path`)
        return { children: [] }
      }
    }
  }

  // Now search for the target command in the correct context
  console.debug(
    "[GetChildrenCommands] Searching for target command:",
    message.id,
  )
  console.debug(
    "[GetChildrenCommands] Commands to search in:",
    commandToSearch.map((c) => c.id),
  )

  const targetCommand = await findCommand(
    commandToSearch,
    message.id,
    message.context,
  )

  console.debug(
    "[GetChildrenCommands] Target command found:",
    targetCommand ? targetCommand.id : "null",
  )
  console.debug(
    "[GetChildrenCommands] Is Group?",
    targetCommand && (targetCommand as CommandNode).type === "group",
  )

  const isGroup = !!(
    targetCommand &&
    "type" in (targetCommand as CommandNode) &&
    (targetCommand as CommandNode).type === "group"
  )
  if (targetCommand && isGroup) {
    console.debug(
      "[GetChildrenCommands] Getting children for command:",
      targetCommand.id,
    )
    const children = await (targetCommand as GroupCommandNode).children(
      message.context,
    )
    console.debug(
      "[GetChildrenCommands] Children found:",
      children.length,
      (children as Array<CommandNode>).map((c) => c.id),
    )

    const parentNameString = await resolveCommandName(
      targetCommand.name,
      message.context,
    )
    const childSuggestions = await commandsToSuggestions(
      children,
      message.context,
      parentNameString,
    )

    console.debug(
      "[GetChildrenCommands] Child suggestions:",
      childSuggestions.length,
    )
    return { children: childSuggestions }
  }

  console.debug(
    "[GetChildrenCommands] No target command or not a group, returning empty",
  )
  return { children: [] }
}

export const getChildrenCommands = createMessageHandler(
  handleGetChildrenCommands,
  "Failed to get command children",
)
