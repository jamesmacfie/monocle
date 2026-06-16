import type { GetKeybindingStateMessage } from "../../shared/types"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { getKeybindingRegistrySnapshot } from "../keybindings/registry"
import { createMessageHandler } from "../utils/messages"

const handleGetKeybindingState = async (
  message: GetKeybindingStateMessage,
  sender?: any,
) => {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )
  const snapshot = await getKeybindingRegistrySnapshot(message.context, {
    siteSdk,
  })

  return {
    exactKeybindings: [...snapshot.bindings.keys()],
    sequencePrefixes: [...snapshot.sequencePrefixes],
  }
}

export const getKeybindingState = createMessageHandler(
  handleGetKeybindingState,
  "Failed to get keybinding state",
)
