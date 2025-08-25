import type { GetChildrenCommandsMessage } from "../../types";
import { commandsToSuggestions, getCommands as getCommandsFromBackground } from "../commands";
import { createMessageHandler } from "../utils/messages";
import { resolveCommandName } from "../utils/commands";

const handleGetChildrenCommands = async (message: GetChildrenCommandsMessage) => {
  const { favorites: cmdFavorites, suggestions: cmdSuggestions, recents: cmdRecents } = await getCommandsFromBackground();
  const allCommands = [...cmdFavorites, ...cmdRecents, ...cmdSuggestions];

  const parentCommand = allCommands.find(cmd => cmd.id === message.id);

  if (parentCommand && 'commands' in parentCommand) {
    const children = await parentCommand.commands(message.context);
    const parentNameString = await resolveCommandName(parentCommand.name, message.context);
    const childSuggestions = await commandsToSuggestions(children, message.context, parentNameString);

    return { children: childSuggestions };
  }

  return { children: [] };
};

export const getChildrenCommands = createMessageHandler(
  handleGetChildrenCommands,
  "Failed to get command children"
);