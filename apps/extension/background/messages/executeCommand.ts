import type { ExecuteCommandMessage } from "../../shared/types"
import { executeCommand as executeCommandFromBackground } from "../commands"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { createMessageHandler } from "../utils/messages"

const handleExecuteCommand = async (
  message: ExecuteCommandMessage,
  sender?: any,
) => {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )

  await executeCommandFromBackground(
    message.id,
    message.context,
    message.formValues ?? {},
    message.parentNames,
    message.executionScope,
    { siteSdk },
  )
  return { success: true }
}

export const executeCommand = createMessageHandler(
  handleExecuteCommand,
  "Failed to execute command",
)
