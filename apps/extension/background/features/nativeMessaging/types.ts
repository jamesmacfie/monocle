// Architecture: background feature layer (Native Messaging bridge). Durable
// config + transient pairing state shapes for the bridge feature. Config holds
// the opt-in flag and the paired clients (token HASHES only — the plaintext
// token is returned to the app once at pairing and never stored). Pending
// pairing state is transient (feature-state), cleared on resolve/expiry/startup.
// See docs/native-messaging/.
import { z } from "zod"
import { BRIDGE_SCOPES, type BridgeScope } from "../../../shared/types"

export const NATIVE_MESSAGING_FEATURE_ID = "native-messaging"

// A client that completed pairing. We store only the token's hash; the plaintext
// is unrecoverable, so a lost token requires re-pairing.
export type PairedClient = {
  instanceId: string
  name: string
  tokenHash: string
  scopes: BridgeScope[]
  createdAt: number
  lastUsedAt?: number
}

export type NativeMessagingConfig = {
  enabled: boolean
  // Global opt-in for v2 command execution (off by default). When false, the
  // commands/execute method is refused even for a validly-paired client. See
  // docs/native-messaging/execution.md.
  allowExecution: boolean
  pairedClients: PairedClient[]
}

export const nativeMessagingConfigDefaults: NativeMessagingConfig = {
  enabled: false,
  allowExecution: false,
  pairedClients: [],
}

const pairedClientSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1),
  tokenHash: z.string().min(1),
  scopes: z.array(z.enum(BRIDGE_SCOPES)),
  createdAt: z.number(),
  lastUsedAt: z.number().optional(),
})

export const nativeMessagingConfigSchema = z.object({
  enabled: z.boolean(),
  allowExecution: z.boolean(),
  pairedClients: z.array(pairedClientSchema).max(50),
})

// Transient pending pairing (feature-state). A LIST now (not a single slot):
// the Integrations page lists everything that has attempted to integrate, so
// concurrent requests from different apps must coexist. Keyed by pairingId; a
// new request from the same instanceId supersedes its prior one. The code is
// stored hashed, like the token.
//
// Direction B: the human types the code on the browser's Integrations page, so
// the browser verifies + mints the token (status -> "approved", approvedToken
// set transiently), and the app collects it on its next `pair/poll-status`.
// ponytail: plaintext token sits in transient feature-state between Accept and
// the app's next poll — acceptable; it is the same value sent over the wire and
// is cleared on read/startup.
export type PendingPairing = {
  pairingId: string
  codeHash: string
  expiresAt: number
  attempts: number
  status: "pending" | "approved"
  approvedToken?: string
  client: { name: string; instanceId: string }
}

// The feature-state value: the full list of pending/approved pairings.
export type PendingPairings = PendingPairing[]
