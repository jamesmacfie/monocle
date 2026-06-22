// Architecture: background command system, extension-to-extension bridge.
// Entry point: load all approved peers' cached command trees into root
// CommandNodes (synchronously, from the warmed registry cache — never wakes a
// peer), plus the helpers the protocol handler and feature module use to
// register/dispose/recognise peer commands. See
// docs/extension-extension/architecture.md.
import type { CommandNode } from "../../../shared/types"
import { createExternalRootCommands } from "../externalProvider"
import { isExternalCommandId } from "../externalProvider/ids"
import { EXTENSION_COMMAND_ID_PREFIX, extensionAdapter } from "./adapter"
import { getAllExtensionEntries } from "./registry"

// Recognises commands produced by an approved peer extension (analogous to
// isSiteSdkCommandId). Used by ordering/keybinding logic without the registry.
export const isExtensionCommandId = (id: string): boolean =>
  isExternalCommandId(EXTENSION_COMMAND_ID_PREFIX, id)

// All root commands contributed by every approved+registered peer. Synchronous:
// reads the in-memory cache, so it composes into the sync command loader.
export const loadExtensionSdkCommands = (): CommandNode[] =>
  getAllExtensionEntries().flatMap((entry) =>
    createExternalRootCommands(extensionAdapter, entry, entry.registrations),
  )

export { EXTENSION_COMMAND_ID_PREFIX } from "./adapter"
export {
  clearAllExtensionRegistrations,
  clearExtensionRegistrations,
  getAllExtensionEntries,
  getExtensionEntry,
  initExtensionRegistry,
  setExtensionRegistrations,
} from "./registry"
