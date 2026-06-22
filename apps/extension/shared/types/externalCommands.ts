// Architecture: shared/ type layer. The declarative command model shared by
// every "external command provider" — untrusted, externally-owned command trees
// converted into background-owned CommandNodes. Today that is the site SDK
// (page-world `window.Monocle`) and the extension-to-extension feature (peer
// browser extensions). Both speak the SAME schema, caps, and callback
// re-validation; only the transport + identity + durability differ.
//
// The schema itself lives in ./siteSdk.ts (it shipped there first and has its
// own tests). This module re-exports it under transport-neutral `External*`
// names so the shared engine (background/commands/externalProvider/) and the
// extensionSdk adapter read cleanly without depending on "site" naming. A future
// physical move of the schema into this file would be a pure rename. See
// docs/extension-extension/provider-refactor.md.
export type {
  SiteSdkCallbackRef as ExternalCallbackRef,
  SiteSdkCommand as ExternalCommand,
  SiteSdkInvokeRequest as ExternalInvokeRequest,
  SiteSdkRegistration as ExternalRegistration,
} from "./siteSdk"
export {
  SITE_SDK_MAX_COMMANDS as EXTERNAL_MAX_COMMANDS,
  SITE_SDK_MAX_DEPTH as EXTERNAL_MAX_DEPTH,
  validateSiteSdkCommandList as validateExternalCommandList,
  validateSiteSdkRegistrations as validateExternalRegistrations,
} from "./siteSdk"
