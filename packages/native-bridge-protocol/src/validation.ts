import { z } from "zod"
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SCOPES,
  type BridgeErrorCode,
  type BridgeResponse,
} from "./wire"

// The native host populates `auth.token` from the HTTP `Authorization: Bearer`
// header before forwarding JSON over stdio.
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
    method: z.literal("pair/poll-status"),
    params: z.object({
      pairingId: z.string().min(1),
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
    params: z.object({
      id: z.string().min(1),
      confirmed: z.boolean().optional(),
    }),
  }),
])

export type BridgeRequest = z.infer<typeof BridgeRequestSchema>

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
