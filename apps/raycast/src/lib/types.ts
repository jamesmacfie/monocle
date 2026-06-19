// Raycast-local shim over the shared public bridge protocol. Keep the app's
// Raycast-specific `Prefs` here, but source all wire DTOs from packages/*.
export {
  BRIDGE_PROTOCOL_VERSION,
  MONOCLE_TARGET_HEADER,
  type BridgeErrorCode,
  type BridgeMethod,
  type BridgeParams,
  type BridgeReply,
  type BridgeResult,
  type ExecuteResult,
  type ExternalSuggestion,
  type InstanceMeta,
  type InstancesResult,
  type MetaInfo,
  type PairRequestResult,
  type PairSubmitCodeResult,
  type SuggestionsResult,
} from "../../../../packages/native-bridge-protocol/src/wire";

// Extension-level preferences (manifest `preferences`). Declared locally so a
// bare `tsc` check works without ray's generated raycast-env.d.ts.
export type Prefs = { port?: string; host?: string };
