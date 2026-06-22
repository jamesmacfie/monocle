// Architecture: background command system, site-SDK bridge. The site SDK is now
// a thin ADAPTER over the shared external-command provider
// (background/commands/externalProvider/). This file supplies only what is
// genuinely site-specific: the "site:" id prefix, the origin-hash scope token,
// the transport (round-trip into the owning tab's page world via the content
// bridge), the page-derived fallback context, the generated per-site group, and
// the `placement: "root"` split. The shared engine owns the per-node-type
// conversion, id encoding, and re-validation of callback output. See
// docs/site-sdk.md, docs/site-sdk-security.md, and
// docs/extension-extension/provider-refactor.md.
import type {
  CommandNode,
  ExternalCommand,
  ExternalInvokeRequest,
  ExternalRegistration,
} from "../../../shared/types"
import { validateExternalCommandList } from "../../../shared/types"
import { sendTabMessage } from "../../utils/browser"
import {
  createExternalRootCommands,
  type ExternalProviderAdapter,
  isExternalCommandId,
} from "../externalProvider"
import type { SiteSdkRegistryEntry } from "./registry"
import {
  getSiteSdkHostLabel,
  hashSiteSdkOrigin,
  type SiteSdkScope,
} from "./scope"

export const SITE_SDK_COMMAND_ID_PREFIX = "site:"

/**
 * Identifies commands produced from page-owned SDK declarations.
 *
 * This is used by ordering/keybinding logic without importing the registry.
 */
export const isSiteSdkCommandId = (id: string): boolean =>
  isExternalCommandId(SITE_SDK_COMMAND_ID_PREFIX, id)

// Callback-returned children/results are untrusted page output, so they are
// validated again and treated as nested commands where `placement` is illegal.
const validateCallbackCommands = (commands: unknown): ExternalCommand[] => {
  const validation = validateExternalCommandList(commands, {
    allowPlacement: false,
  })

  if (!validation.success) {
    throw new Error(validation.error)
  }

  return validation.commands
}

// Sends a scoped callback request to the content bridge in the tab that owns the
// registration. The bridge then crosses into the page world.
const invokeSiteSdk = async (
  scope: SiteSdkScope,
  request: ExternalInvokeRequest,
): Promise<ExternalCommand[] | undefined> => {
  const response = await sendTabMessage(scope.tabId, {
    type: "monocle-site-sdk-invoke",
    request,
  })

  if (!response?.success) {
    throw new Error(response?.error || "Site SDK callback failed")
  }

  if (response.commands) {
    return validateCallbackCommands(response.commands)
  }

  return undefined
}

// The site-specific adapter: the only behavioral differences from the extension
// provider are transport (page bridge), scope token (origin hash), fallback
// context (the page url/title), and the `placement: "root"` split.
const siteAdapter: ExternalProviderAdapter<SiteSdkRegistryEntry> = {
  idPrefix: SITE_SDK_COMMAND_ID_PREFIX,
  scopeId: (entry) => hashSiteSdkOrigin(entry.scope.origin),
  invoke: (entry, request) => invokeSiteSdk(entry.scope, request),
  fallbackContext: (entry) => ({
    url: entry.scope.url,
    title: entry.scope.title,
    modifierKey: null,
  }),
  ownerGroup: (entry, registration: ExternalRegistration) => {
    const hostLabel = getSiteSdkHostLabel(entry.scope.origin)
    return {
      publicId: "__site-group",
      name: registration.name || hostLabel,
      description: `Commands from ${hostLabel}`,
      icon: registration.icon || { type: "lucide", name: "Globe" },
      color: "gray",
      keywords: ["site", "website", hostLabel, registration.namespace],
    }
  },
  partitionRoot: (commands) => ({
    root: commands.filter((command) => command.placement === "root"),
    grouped: commands.filter((command) => command.placement !== "root"),
  }),
}

/**
 * Builds the root commands contributed by one scoped SDK registry entry.
 */
export const createSiteSdkRootCommands = (
  entry?: SiteSdkRegistryEntry,
): CommandNode[] => {
  if (!entry) {
    return []
  }

  return createExternalRootCommands(siteAdapter, entry, entry.registrations)
}
