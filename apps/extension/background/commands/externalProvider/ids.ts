// Architecture: background command system, shared external-command provider.
// Internal command-id encoding shared by every external provider. Ids embed the
// owner prefix, a stable scope token, the registration id, and the dotted public
// path so dynamic children resolve and per-command settings/favorites stay
// scoped to the owner. See docs/extension-extension/architecture.md.
import type { ExternalProviderAdapter } from "./types"

// `<prefix><scopeId>:<registrationId>:<dotted public path>`
export const toInternalCommandId = <TEntry>(
  adapter: ExternalProviderAdapter<TEntry>,
  entry: TEntry,
  registrationId: string,
  path: string[],
): string =>
  `${adapter.idPrefix}${adapter.scopeId(entry)}:${registrationId}:${path.join(".")}`

// Recognises commands produced by a given provider without importing its
// registry — used by ordering/keybinding logic. (`isSiteSdkCommandId` /
// `isExtensionCommandId` are the concrete instances.)
export const isExternalCommandId = (prefix: string, id: string): boolean =>
  id.startsWith(prefix)
