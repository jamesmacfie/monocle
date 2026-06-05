import type { GetKeybindingStateMessage } from "../../shared/types"
import { getKeybindingRegistrySnapshot } from "../keybindings/registry"
import { createMessageHandler } from "../utils/messages"

const handleGetKeybindingState = async (message: GetKeybindingStateMessage) => {
  const snapshot = await getKeybindingRegistrySnapshot(message.context)

  return {
    exactKeybindings: [...snapshot.bindings.keys()],
    sequencePrefixes: [...snapshot.sequencePrefixes],
  }
}

export const getKeybindingState = createMessageHandler(
  handleGetKeybindingState,
  "Failed to get keybinding state",
)
