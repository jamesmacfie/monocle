import type {
  CommandNode,
  GetChildrenMessage,
  GroupCommandNode,
  SearchCommandNode,
} from "../../shared/types"
import {
  commandsToSuggestions,
  findCommand,
  getCommands as getCommandsFromBackground,
} from "../commands"
import { getAllCommandSettings } from "../commands/settings"
import { resolveCommandName } from "../utils/commands"
import { createMessageHandler } from "../utils/messages"
import { filterCommandsByUrl } from "../utils/urlFilter"

const handleGetChildrenCommands = async (message: GetChildrenMessage) => {
  const { favorites: cmdFavorites, suggestions: cmdSuggestions } =
    await getCommandsFromBackground(message.context)
  const allCommands = [...cmdFavorites, ...cmdSuggestions]

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
  const targetCommand = await findCommand(
    commandToSearch,
    message.id,
    message.context,
  )

  const isGroup = !!(
    targetCommand &&
    "type" in (targetCommand as CommandNode) &&
    (targetCommand as CommandNode).type === "group"
  )
  if (targetCommand && isGroup) {
    const children = await (targetCommand as GroupCommandNode).children(
      message.context,
    )

    // Get all command settings for URL filtering
    const commandSettings = await getAllCommandSettings()

    // Filter children based on URL rules
    const filteredChildren = await filterCommandsByUrl(
      children,
      message.context.url || "",
      commandSettings,
    )

    const parentNameString = await resolveCommandName(
      targetCommand.name,
      message.context,
    )
    const childSuggestions = await commandsToSuggestions(
      filteredChildren,
      message.context,
      parentNameString,
    )

    return {
      children: childSuggestions,
      openPage: true,
      dynamicChildren: false,
    }
  }

  // Handle search command nodes with dynamic results
  if (targetCommand && (targetCommand as CommandNode).type === "search") {
    const searchNode = targetCommand as SearchCommandNode
    const search = (message.searchValue || "").trim()
    let children: CommandNode[] = []
    if (search) {
      try {
        children = await searchNode.getResults(message.context, search)
      } catch (error) {
        console.error(
          `[SearchNode] Error resolving results for ${searchNode.id}:`,
          error,
        )
      }
    }

    // Get all command settings for URL filtering
    const { getAllCommandSettings } = require("../commands")
    const commandSettings = await getAllCommandSettings()

    // Filter children based on URL rules
    const { filterCommandsByUrl } = require("../utils/urlFilter")
    const filteredChildren = await filterCommandsByUrl(
      children,
      message.context.url || "",
      commandSettings,
    )

    const parentNameString = await resolveCommandName(
      searchNode.name,
      message.context,
    )
    const childSuggestions = await commandsToSuggestions(
      filteredChildren,
      message.context,
      parentNameString,
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
