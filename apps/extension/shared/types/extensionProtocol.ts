// Architecture: shared/ type layer. The wire contract between a peer browser
// extension and Monocle, carried over native cross-extension messaging
// (`chrome.runtime.sendMessage`/`onMessageExternal` for peer→Monocle control
// messages; a `chrome.runtime.connect` port for Monocle→peer invoke). Mirrors
// the native bridge's `{v,id,…}` envelope and the site SDK's invoke shapes so a
// reviewer familiar with either recognises it. Kept dependency-light (only Zod +
// sibling type imports) so a peer author can read it as the spec. See
// docs/extension-extension/protocol.md.
import { z } from "zod"
import type { ExternalInvokeRequest } from "./externalCommands"

export const EXT_PROTOCOL_VERSION = 1

// Port name Monocle uses for the invoke RPC (`chrome.runtime.connect(extId)`).
export const EXT_INVOKE_PORT = "monocle-ext-invoke"

export type ExtErrorCode =
  | "unsupported_version"
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "not_enabled"
  | "internal"

export type ExtResponse<T = unknown> =
  | { v: number; id: string; ok: true; result: T }
  | {
      v: number
      id: string
      ok: false
      error: { code: ExtErrorCode; message: string }
    }

const EnvelopeBase = {
  v: z.literal(EXT_PROTOCOL_VERSION),
  id: z.string().min(1),
}

// Display-only metadata the peer claims about itself at announce time. Shown on
// the Integrations page clearly labelled "as claimed by <extId>"; never trusted.
const ManifestSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  })
  .strict()

// Control messages: peer → Monocle, over onMessageExternal. The registrations
// payload is validated structurally here (an array within caps) and then deeply
// by validateExternalRegistrations downstream (full schema + tree caps).
export const ExtRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...EnvelopeBase,
      kind: z.literal("announce"),
      params: z.object({ manifest: ManifestSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...EnvelopeBase,
      kind: z.literal("register"),
      params: z
        .object({ registrations: z.array(z.unknown()).max(20) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...EnvelopeBase,
      kind: z.literal("dispose"),
      params: z.object({}).strict().optional(),
    })
    .strict(),
])

export type ExtRequest = z.infer<typeof ExtRequestSchema>

export const extOk = <T>(id: string, result: T): ExtResponse<T> => ({
  v: EXT_PROTOCOL_VERSION,
  id,
  ok: true,
  result,
})

export const extError = (
  id: string,
  code: ExtErrorCode,
  message: string,
): ExtResponse => ({
  v: EXT_PROTOCOL_VERSION,
  id,
  ok: false,
  error: { code, message },
})

// The invoke RPC envelope Monocle posts over the port (Monocle → peer).
export type ExtInvokeMessage = {
  v: number
  id: string
  kind: "invoke"
  request: ExternalInvokeRequest
}

// The peer's reply over the port. `commands` for children/search; bare ok for a
// fire-and-forget execute; error otherwise.
export type ExtInvokeReply =
  | { v: number; id: string; ok: true; commands?: unknown }
  | {
      v: number
      id: string
      ok: false
      error?: { code?: string; message?: string }
    }
