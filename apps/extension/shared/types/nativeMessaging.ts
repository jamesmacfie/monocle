// Architecture: shared/ type layer. The PUBLIC wire contract for the native
// messaging bridge (docs/native-messaging/protocol.md). The external desktop
// app (first target: Raycast) codes against these shapes, carried verbatim by
// the native host over stdio. This file is the single source of truth for both
// the TypeScript types and their Zod validators, so the wire shape and its
// validation cannot drift. Internal palette types (Suggestion, CommandNode)
// never cross this boundary — suggestions are projected to ExternalSuggestion
// by background/features/nativeMessaging/externalSuggestion.ts.
import { z } from "zod"

// Native messaging host name (matches the host manifest's `name`).
export const NATIVE_MESSAGING_HOST = "com.monocle.bridge"

export const BRIDGE_PROTOCOL_VERSION = 1

// Scopes a paired client can hold. `commands:execute` (v2) is a larger blast
// radius than reading, so it is additionally gated by a global opt-in flag
// (allowExecution) — see docs/native-messaging/execution.md.
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
  // v2 execution
  | "not_found"
  | "forbidden"
  | "execution_disabled"
  | "execution_failed"

// A stable, intentionally narrow projection of the internal Suggestion. UI-only
// fields (actions, weights, modifier labels, execution payloads) are dropped.
export type ExternalSuggestion = {
  id: string
  type: "action" | "submit" | "group" | "search" | "display" | "calculation"
  title: string
  subtitle?: string
  icon?: string
  keywords?: string[]
  requiresPermission?: string[]
}

// ---------------------------------------------------------------------------
// Request envelope (discriminated by `method`).
// ---------------------------------------------------------------------------

// The native host populates `auth.token` from the HTTP `Authorization: Bearer`
// header before forwarding the JSON over stdio (the host strips no other state).
const AuthSchema = z.object({ token: z.string().min(1) }).optional()

const EnvelopeBase = {
  v: z.literal(BRIDGE_PROTOCOL_VERSION),
  id: z.string().min(1),
  auth: AuthSchema,
}

export const ClientIdentitySchema = z.object({
  name: z.string().min(1).max(100),
  instanceId: z.string().min(1).max(200),
})
export type ClientIdentity = z.infer<typeof ClientIdentitySchema>

export const BridgeRequestSchema = z.discriminatedUnion("method", [
  z.object({
    ...EnvelopeBase,
    method: z.literal("meta/info"),
    params: z.object({}).optional(),
  }),
  z.object({
    ...EnvelopeBase,
    method: z.literal("status"),
    params: z.object({}).optional(),
  }),
  z.object({
    ...EnvelopeBase,
    method: z.literal("pair/request"),
    params: z.object({ client: ClientIdentitySchema }),
  }),
  z.object({
    ...EnvelopeBase,
    method: z.literal("pair/submit-code"),
    params: z.object({
      pairingId: z.string().min(1),
      code: z.string().min(1).max(32),
    }),
  }),
  z.object({
    ...EnvelopeBase,
    method: z.literal("suggestions/get-for-active-tab"),
    params: z
      .object({
        limit: z.number().int().positive().optional(),
        includeFavorites: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    ...EnvelopeBase,
    method: z.literal("suggestions/search-active-tab"),
    params: z.object({
      query: z.string(),
      limit: z.number().int().positive().optional(),
    }),
  }),
  z.object({
    ...EnvelopeBase,
    // Drill into a group/search node. `path` is the breadcrumb of command ids
    // from root to the node being entered (["bookmarks"], ["a","b"], …); the
    // returned suggestions are that node's children, which may themselves be
    // groups — so the caller nests by appending to `path`. A read, scoped to
    // `suggestions:read` like the other suggestion methods.
    method: z.literal("suggestions/get-children"),
    params: z.object({
      path: z.array(z.string().min(1)).min(1).max(20),
      query: z.string().optional(),
      limit: z.number().int().positive().optional(),
    }),
  }),
  z.object({
    ...EnvelopeBase,
    method: z.literal("commands/execute"),
    params: z.object({ id: z.string().min(1) }),
  }),
])

export type BridgeRequest = z.infer<typeof BridgeRequestSchema>
export type BridgeMethod = BridgeRequest["method"]

// ---------------------------------------------------------------------------
// Response envelope.
// ---------------------------------------------------------------------------

export type BridgeResponse =
  | { v: number; id: string; ok: true; result: unknown }
  | {
      v: number
      id: string
      ok: false
      error: { code: BridgeErrorCode; message: string }
    }

export const bridgeOk = (id: string, result: unknown): BridgeResponse => ({
  v: BRIDGE_PROTOCOL_VERSION,
  id,
  ok: true,
  result,
})

export const bridgeError = (
  id: string,
  code: BridgeErrorCode,
  message: string,
): BridgeResponse => ({
  v: BRIDGE_PROTOCOL_VERSION,
  id,
  ok: false,
  error: { code, message },
})
