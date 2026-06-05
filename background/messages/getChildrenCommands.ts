import type {
  CommandNode,
  GetChildrenMessage,
  SearchCommandNode,
} from "../../shared/types"
import { commandsToSuggestions } from "../commands"
import { getCommandPageCommands } from "../commands/query"
import { resolveCommandName } from "../utils/commands"
import { createMessageHandler } from "../utils/messages"

const handleGetChildrenCommands = async (message: GetChildrenMessage) => {
  const parentPath = message.parentPath || []
  const currentPage = await getCommandPageCommands(
    message.context,
    parentPath,
    message.searchValue,
  )

  const targetCommand = currentPage.commands.find(
    (command) => command.id === message.id,
  )

  const isGroup = !!(
    targetCommand &&
    "type" in (targetCommand as CommandNode) &&
    (targetCommand as CommandNode).type === "group"
  )

  if (targetCommand && isGroup) {
    const targetPath = [...parentPath, message.id]
    const targetPage = await getCommandPageCommands(message.context, targetPath)
    const parentNameString = await resolveCommandName(
      targetCommand.name,
      message.context,
    )
    const childSuggestions = await commandsToSuggestions(
      targetPage.commands,
      message.context,
      parentNameString,
      targetPage.inheritedPermissions,
    )

    return {
      children: childSuggestions,
      openPage: true,
      dynamicChildren: false,
    }
  }

  if (targetCommand && (targetCommand as CommandNode).type === "search") {
    const targetPath = [...parentPath, message.id]
    const targetPage = await getCommandPageCommands(
      message.context,
      targetPath,
      message.searchValue,
    )
    const searchNode = targetCommand as SearchCommandNode
    const parentNameString = await resolveCommandName(
      searchNode.name,
      message.context,
    )
    const childSuggestions = await commandsToSuggestions(
      targetPage.commands,
      message.context,
      parentNameString,
      targetPage.inheritedPermissions,
    )

    return {
      children: childSuggestions,
      openPage: true,
      dynamicChildren: true,
    }
  }

  return { children: [] }
}

export const getChildrenCommands = createMessageHandler(
  handleGetChildrenCommands,
  "Failed to get command children",
)
