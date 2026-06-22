// Architecture: background command system, extension-to-extension bridge. The
// ExternalProviderAdapter for peer extensions — the second consumer of the
// shared engine (the site SDK is the first). The only differences from the site
// adapter: the "extension:" id prefix, the extId scope token, the cross-
// extension invoke transport, a neutral fallback context (a peer command is not
// tied to a page), the generated per-peer group, and NO root placement
// (everything lives under the peer's group). See
// docs/extension-extension/provider-refactor.md.
import type { ExternalRegistration } from "../../../shared/types"
import type { ExternalProviderAdapter } from "../externalProvider"
import type { ExtensionRegistrationEntry } from "./registry"
import { invokeExtension } from "./transport"

export const EXTENSION_COMMAND_ID_PREFIX = "extension:"

export const extensionAdapter: ExternalProviderAdapter<ExtensionRegistrationEntry> =
  {
    idPrefix: EXTENSION_COMMAND_ID_PREFIX,
    scopeId: (entry) => entry.extId,
    invoke: (entry, request) => invokeExtension(entry.extId, request),
    // A peer command is not bound to a page; synthesize a neutral context.
    fallbackContext: () => ({ url: "", title: "", modifierKey: null }),
    ownerGroup: (entry, registration: ExternalRegistration) => {
      const label = registration.name || registration.namespace || entry.extId
      return {
        publicId: "__ext-group",
        name: label,
        description: `Commands from ${label}`,
        icon: registration.icon || { type: "lucide", name: "Puzzle" },
        color: "gray",
        keywords: ["extension", registration.namespace, label],
      }
    },
    // No partitionRoot — peer commands always live under the per-peer group.
  }
