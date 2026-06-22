// Architecture: background command system, shared external-command provider.
// The transport-agnostic engine that turns an untrusted, externally-owned
// declarative command tree into background-owned CommandNodes. Parameterised
// over an adapter that supplies the ONLY real differences between providers:
// the owner-id prefix, the stable scope token baked into ids, the transport
// seam (round-trip to a page vs a peer extension), the fallback context, and
// the generated per-owner group + optional root placement. See
// docs/extension-extension/provider-refactor.md.
import type {
  Browser,
  ColorName,
  CommandColor,
  CommandIcon,
  ExternalCommand,
  ExternalInvokeRequest,
  ExternalRegistration,
} from "../../../shared/types"

// Display metadata for the generated group that holds a registration's commands
// (the site SDK's per-site group, the extension feature's per-peer group).
export type OwnerGroupMeta = {
  // Public id segment of the group (e.g. "__site-group"). Encoded into the
  // group's internal id like any other public command id — keep it STABLE per
  // adapter, since user settings/keybindings key on the resulting id.
  publicId: string
  name: string
  description: string
  icon: CommandIcon
  color: ColorName | CommandColor
  keywords: string[]
}

export type ExternalProviderAdapter<TEntry> = {
  // Owner-id prefix, e.g. "site:" or "extension:".
  idPrefix: string
  // Stable scope token baked into ids (origin hash for sites, extId for peers).
  scopeId: (entry: TEntry) => string
  // The transport seam — the only behavioral difference between site/extension.
  invoke: (
    entry: TEntry,
    request: ExternalInvokeRequest,
  ) => Promise<ExternalCommand[] | undefined>
  // Browser.Context to synthesize when an executable/dynamic field receives none.
  fallbackContext: (entry: TEntry) => Browser.Context
  // Metadata for the generated per-owner group holding non-root commands.
  ownerGroup: (
    entry: TEntry,
    registration: ExternalRegistration,
  ) => OwnerGroupMeta
  // Optional split of a registration's commands into root-placed vs grouped.
  // Sites use `placement: "root"`; extensions group everything (omit this).
  partitionRoot?: (commands: ExternalCommand[]) => {
    root: ExternalCommand[]
    grouped: ExternalCommand[]
  }
}
