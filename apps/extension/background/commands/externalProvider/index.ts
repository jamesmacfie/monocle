// Architecture: background command system, shared external-command provider.
// Public entry point: turn one owner's registrations into the root CommandNodes
// it contributes. Commands flagged for root placement (adapter.partitionRoot)
// are emitted directly; everything else lives under a generated per-owner group
// so an owner can add a compact top-level entry without naming its own group.
// Used by both the site SDK adapter and the extensionSdk adapter. See
// docs/extension-extension/provider-refactor.md.
import type {
  CommandNode,
  ExternalCommand,
  ExternalRegistration,
} from "../../../shared/types"
import { convertCommands } from "./convert"
import { toInternalCommandId } from "./ids"
import type { ExternalProviderAdapter } from "./types"

export { convertCommand, convertCommands } from "./convert"
export { isExternalCommandId, toInternalCommandId } from "./ids"
export type {
  ExternalProviderAdapter,
  OwnerGroupMeta,
} from "./types"

const createOwnerGroupCommand = <TEntry>(
  adapter: ExternalProviderAdapter<TEntry>,
  entry: TEntry,
  registration: ExternalRegistration,
  commands: ExternalCommand[],
): CommandNode => {
  const meta = adapter.ownerGroup(entry, registration)
  const id = toInternalCommandId(adapter, entry, registration.id, [
    meta.publicId,
  ])

  return {
    type: "group",
    id,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    color: meta.color,
    keywords: meta.keywords,
    settingsCatalog: {
      configurable: false,
    },
    enableDeepSearch: true,
    children: async () =>
      convertCommands(commands, {
        adapter,
        entry,
        registrationId: registration.id,
        path: [meta.publicId],
      }),
  }
}

/**
 * Builds the root commands contributed by one owner's registrations.
 *
 * Ordering matters: root-placed commands are emitted before the generated owner
 * group so query sorting can place all external entries before native ones.
 */
export const createExternalRootCommands = <TEntry>(
  adapter: ExternalProviderAdapter<TEntry>,
  entry: TEntry,
  registrations: ExternalRegistration[],
): CommandNode[] => {
  const rootCommands: CommandNode[] = []

  for (const registration of registrations) {
    const { root, grouped } = adapter.partitionRoot
      ? adapter.partitionRoot(registration.commands)
      : { root: [], grouped: registration.commands }

    rootCommands.push(
      ...convertCommands(root, {
        adapter,
        entry,
        registrationId: registration.id,
        path: [],
      }),
    )

    if (grouped.length > 0) {
      rootCommands.push(
        createOwnerGroupCommand(adapter, entry, registration, grouped),
      )
    }
  }

  return rootCommands
}
