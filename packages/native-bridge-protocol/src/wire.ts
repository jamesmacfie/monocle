// Public, dependency-free wire shapes for the Monocle native bridge.
// Keep this file free of browser, WXT, React, Raycast, and Zod imports so
// external clients can type against it without inheriting extension internals.

// Native messaging host name (matches the host manifest's `name`).
export const NATIVE_MESSAGING_HOST = "com.monocle.bridge"

export const BRIDGE_PROTOCOL_VERSION = 1

// HTTP header a caller sets to target a specific connected browser when more
// than one is attached. The daemon strips it (it never reaches the extension)
// and routes to the matching relay by `id`. Absent + one browser → that one;
// absent + multiple → bad_request.
export const MONOCLE_TARGET_HEADER = "X-Monocle-Target"

// One connected browser, as reported by the daemon-local `GET /instances` route.
// `id` is the routing key (browser type, e.g. "chrome") and goes in the target
// header; `name` is for display.
export type InstanceMeta = {
  id: string
  name: string
  channel?: string
  extensionVersion?: string
}

export type InstancesResult = {
  instances: InstanceMeta[]
}

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
  // True when running the command requires user confirmation (a destructive or
  // irreversible action). A client must confirm with the user and send
  // `confirmed: true` on the execute request, or the command is refused.
  confirmAction?: boolean
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
  // The code the app DISPLAYS so the human can type it on the browser's
  // Integrations page. The browser mints the token on Accept; the app then
  // collects it via `pair/poll-status`. See docs/native-messaging/.
  code: string
  expiresInSeconds: number
}

export type PairPollStatusParams = {
  pairingId: string
}

// The app long-polls this after `pair/request` while the human approves in the
// browser. `approved` carries the minted token exactly once (the pending record
// is dropped on read); subsequent polls return `rejected` because the record no
// longer exists.
export type PairPollStatusResult =
  | { status: "pending" }
  | { status: "approved"; token: string; scopes: BridgeScope[] }
  | { status: "expired" }
  | { status: "rejected" }

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
  // The client confirmed a destructive command with the user. Required to run
  // any command whose suggestion carries `confirmAction: true`.
  confirmed?: boolean
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
  "pair/poll-status": PairPollStatusParams
  "suggestions/get-for-active-tab": GetForActiveTabParams | undefined
  "suggestions/search-active-tab": SearchActiveTabParams
  "suggestions/get-children": GetChildrenParams
  "commands/execute": ExecuteParams
}

export type BridgeResultMap = {
  "meta/info": MetaInfo
  status: StatusResult
  "pair/request": PairRequestResult
  "pair/poll-status": PairPollStatusResult
  "suggestions/get-for-active-tab": SuggestionsResult
  "suggestions/search-active-tab": SuggestionsResult
  "suggestions/get-children": SuggestionsResult
  "commands/execute": ExecuteResult
}

export type BridgeMethod = keyof BridgeRequestParams
export type BridgeParams<M extends BridgeMethod> = BridgeRequestParams[M]
export type BridgeResult<M extends BridgeMethod> = BridgeResultMap[M]
