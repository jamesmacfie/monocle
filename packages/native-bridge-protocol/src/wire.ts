// Public, dependency-free wire shapes for the Monocle native bridge.
// Keep this file free of browser, WXT, React, Raycast, and Zod imports so
// external clients can type against it without inheriting extension internals.

// Native messaging host name (matches the host manifest's `name`).
export const NATIVE_MESSAGING_HOST = "com.monocle.bridge"

export const BRIDGE_PROTOCOL_VERSION = 1

// Scopes a paired client can hold. `commands:execute` is a larger blast radius
// than reading, so it is also gated by the extension's global allowExecution
// opt-in.
export const BRIDGE_SCOPES = ["suggestions:read", "commands:execute"] as const
export type BridgeScope = (typeof BRIDGE_SCOPES)[number]

// The app branches on `code`, never on `message`.
export type BridgeErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden_scope"
  | "not_enabled"
  | "pairing_expired"
  | "pairing_rejected"
  | "rate_limited"
  | "no_active_tab"
  | "internal"
  | "not_found"
  | "forbidden"
  | "execution_disabled"
  | "execution_failed"

export type BridgeOk<T> = { ok: true; result: T }
export type BridgeErr = {
  ok: false
  error: { code: BridgeErrorCode; message: string }
}
export type BridgeReply<T> = BridgeOk<T> | BridgeErr

export type BridgeResponse<T = unknown> = {
  v: number
  id: string
} & BridgeReply<T>

// A stable, intentionally narrow projection of the internal Suggestion. UI-only
// fields (actions, weights, modifier labels, execution payloads) are dropped.
export type ExternalSuggestion = {
  id: string
  type: "action" | "submit" | "group" | "search" | "display" | "calculation"
  title: string
  subtitle?: string
  // `icon` keeps the v1 string payload for compatibility; `iconType` removes
  // ambiguity between a Lucide catalog name and a remote favicon URL.
  icon?: string
  iconType?: "lucide" | "url"
  keywords?: string[]
  requiresPermission?: string[]
}

export type ClientIdentity = {
  name: string
  instanceId: string
}

export type MetaInfo = {
  protocolVersions: number[]
  scopes: BridgeScope[]
  bridgeEnabled: boolean
  executionEnabled: boolean
  browser: { name: string; channel?: string; extensionVersion?: string }
}

export type StatusResult = {
  ok: true
  browser: string
  channel?: string
  extensionVersion?: string
  bridgeEnabled: boolean
  executionEnabled: boolean
  portOwner: boolean
}

export type PairRequestParams = {
  client: ClientIdentity
}

export type PairRequestResult = {
  pairingId: string
  expiresInSeconds: number
}

export type PairSubmitCodeParams = {
  pairingId: string
  code: string
}

export type PairSubmitCodeResult = {
  token: string
  scopes: BridgeScope[]
}

export type GetForActiveTabParams = {
  limit?: number
  includeFavorites?: boolean
}

export type SearchActiveTabParams = {
  query: string
  limit?: number
}

export type GetChildrenParams = {
  path: string[]
  query?: string
  limit?: number
}

export type SuggestionsResult = {
  url: string
  title: string
  query?: string
  path?: string[]
  suggestions: ExternalSuggestion[]
}

export type ExecuteParams = {
  id: string
}

export type ExecuteResult = {
  ran: true
  focused?: boolean
  value?: string
  contentType?: string
}

export type EmptyParams = Record<string, never> | undefined

export type BridgeRequestParams = {
  "meta/info": EmptyParams
  status: EmptyParams
  "pair/request": PairRequestParams
  "pair/submit-code": PairSubmitCodeParams
  "suggestions/get-for-active-tab": GetForActiveTabParams | undefined
  "suggestions/search-active-tab": SearchActiveTabParams
  "suggestions/get-children": GetChildrenParams
  "commands/execute": ExecuteParams
}

export type BridgeResultMap = {
  "meta/info": MetaInfo
  status: StatusResult
  "pair/request": PairRequestResult
  "pair/submit-code": PairSubmitCodeResult
  "suggestions/get-for-active-tab": SuggestionsResult
  "suggestions/search-active-tab": SuggestionsResult
  "suggestions/get-children": SuggestionsResult
  "commands/execute": ExecuteResult
}

export type BridgeMethod = keyof BridgeRequestParams
export type BridgeParams<M extends BridgeMethod> = BridgeRequestParams[M]
export type BridgeResult<M extends BridgeMethod> = BridgeResultMap[M]
