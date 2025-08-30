import type { ExecuteCommandMessage } from "../../types/"
import { executeCommand as executeCommandFromBackground } from "../commands"
import { createMessageHandler } from "../utils/messages"

const handleExecuteCommand = async (message: ExecuteCommandMessage) => {
  await executeCommandFromBackground(
    message.id,
    message.context,
    message.formValues ?? {},
  )
  return { success: true }
}

export const executeCommand = createMessageHandler(
  handleExecuteCommand,
  "Failed to execute command",
)
