import { getCommands } from "./getCommands";
import { getChildrenCommands } from "./getChildrenCommands";
import { executeCommand } from "./executeCommand";
import { executeKeybinding } from "./executeKeybinding";
import type { Message } from "../../types";

export const handleMessage = async (message: Message) => {
  console.debug("[HandleMessage] Received message:", message.type, message);
  
  switch (message.type) {
    case "get-commands":
      console.debug("[HandleMessage] Processing get-commands");
      return await getCommands(message);
    case "get-children-commands":
      return await getChildrenCommands(message);
    case "execute-command":
      return await executeCommand(message);
    case "execute-keybinding":
      return await executeKeybinding(message);
    default:
      throw new Error(`Unknown message type: ${(message as any).type}`);
  }
};