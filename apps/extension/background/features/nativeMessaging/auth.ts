// Architecture: background feature layer (Native Messaging bridge). Bearer-token
// authentication for data methods: hash the presented token, constant-time
// compare against every paired client's stored hash, check the method's required
// scope, and confirm the feature is still enabled. Revoking a client deletes its
// hash, so subsequent requests with that token fail here. See
// docs/native-messaging/authentication-and-security.md.
import type { BridgeErrorCode, BridgeScope } from "../../../shared/types"
import { getFeatureConfig, updateFeatureConfig } from "../config"
import { constantTimeEqual, sha256Hex } from "./crypto"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  type NativeMessagingConfig,
  nativeMessagingConfigDefaults,
  type PairedClient,
} from "./types"

export type AuthResult =
  | { ok: true; client: PairedClient }
  | {
      ok: false
      code: Extract<
        BridgeErrorCode,
        "not_enabled" | "unauthorized" | "forbidden_scope"
      >
    }

export const authenticate = async (
  token: string | undefined,
  requiredScope: BridgeScope,
  now: number,
): Promise<AuthResult> => {
  const config = await getFeatureConfig<NativeMessagingConfig>(
    NATIVE_MESSAGING_FEATURE_ID,
    nativeMessagingConfigDefaults,
  )

  if (!config.enabled) {
    return { ok: false, code: "not_enabled" }
  }

  if (!token) {
    return { ok: false, code: "unauthorized" }
  }

  const tokenHash = await sha256Hex(token)

  // Scan every client (no early return on a hash hit) so timing does not reveal
  // which client matched.
  let matched: PairedClient | null = null
  for (const client of config.pairedClients) {
    if (constantTimeEqual(client.tokenHash, tokenHash)) {
      matched = client
    }
  }

  if (!matched) {
    return { ok: false, code: "unauthorized" }
  }

  if (!matched.scopes.includes(requiredScope)) {
    return { ok: false, code: "forbidden_scope" }
  }

  // Best-effort last-used stamp; never blocks the request on failure.
  void touchLastUsed(matched.instanceId, now)

  return { ok: true, client: matched }
}

export const touchLastUsed = async (
  instanceId: string,
  now: number,
): Promise<void> => {
  await updateFeatureConfig<NativeMessagingConfig>(
    NATIVE_MESSAGING_FEATURE_ID,
    nativeMessagingConfigDefaults,
    (config) => {
      if (!config.pairedClients.some((c) => c.instanceId === instanceId)) {
        return config
      }
      return {
        ...config,
        pairedClients: config.pairedClients.map((c) =>
          c.instanceId === instanceId ? { ...c, lastUsedAt: now } : c,
        ),
      }
    },
  )
}
