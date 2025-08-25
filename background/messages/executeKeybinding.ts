import type { ExecuteKeybindingMessage } from "../../types";
import { getCommandIdForKeybinding } from "../keybindings/registry";
import { executeCommand as executeCommandById } from "../commands";
import { createMessageHandler } from "../utils/messages";

const handleExecuteKeybinding = async (message: ExecuteKeybindingMessage) => {

  const commandId = getCommandIdForKeybinding(message.keybinding);

  if (!commandId) {
    return {
      success: false,
      error: `No command registered for keybinding: ${message.keybinding}`
    };
  }


  try {
    // Execute the command with empty form values
    await executeCommandById(commandId, message.context, {});

    return {
      success: true
    };
  } catch (error) {
    console.error(`[ExecuteKeybinding] Failed to execute command ${commandId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
};

export const executeKeybinding = createMessageHandler(
  handleExecuteKeybinding,
  "Failed to execute keybinding"
); 