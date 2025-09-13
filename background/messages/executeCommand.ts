import type { ExecuteCommandMessage } from "../../shared/types"
import { executeCommand as executeCommandFromBackground } from "../commands"
import { createMessageHandler } from "../utils/messages"

const handleExecuteCommand = async (message: ExecuteCommandMessage) => {
  await executeCommandFromBackground(
    message.id,
    message.context,
    message.formValues ?? {},
    message.parentNames,
  )
  return { success: true }
}

export const executeCommand = createMessageHandler(
  handleExecuteCommand,
  "Failed to execute command",
)
