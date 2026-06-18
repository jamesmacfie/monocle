// Architecture: background feature layer (Native Messaging bridge). The
// bluetooth-style pairing flow: the confirmation code travels extension → human
// → app, never extension → app directly. beginPairing shows the plaintext code
// in a modal surface and returns only a pairingId; submitCode verifies the
// human-typed code (constant-time over hashes), mints a scoped bearer token, and
// returns the plaintext token EXACTLY ONCE. See
// docs/native-messaging/authentication-and-security.md.
import {
  BRIDGE_SCOPES,
  type BridgeScope,
  type ClientIdentity,
  type ContentBlock,
} from "../../../shared/types"
import { removeSurface, upsertSurface } from "../../surfaces"
import { getFeatureConfig, setFeatureConfig } from "../config"
import { clearFeatureState, getFeatureState, setFeatureState } from "../state"
import {
  constantTimeEqual,
  generatePairingCode,
  generateToken,
  sha256Hex,
} from "./crypto"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  type NativeMessagingConfig,
  nativeMessagingConfigDefaults,
  type PairedClient,
  type PendingPairing,
} from "./types"

const PAIRING_TTL_MS = 60_000
const MAX_ATTEMPTS = 5
export const PAIRING_MODAL_ID = "pairing"

export type BeginPairingResult = { pairingId: string; expiresInSeconds: number }
export type SubmitCodeResult =
  | { ok: true; token: string; scopes: BridgeScope[] }
  | {
      ok: false
      code: "pairing_rejected" | "pairing_expired"
    }

const readConfig = (): Promise<NativeMessagingConfig> =>
  getFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, nativeMessagingConfigDefaults)

// Remove the pairing modal from whatever host is showing it. Owner is the bare
// feature id (not session-prefixed); init() also clears a stale one on startup.
const clearPairingModal = (): Promise<void> =>
  removeSurface(NATIVE_MESSAGING_FEATURE_ID, PAIRING_MODAL_ID)

const clearPending = async (): Promise<void> => {
  await clearFeatureState(NATIVE_MESSAGING_FEATURE_ID)
  await clearPairingModal()
}

// Begin pairing: generate a code, store its hash + expiry transiently, and show
// the plaintext code in a modal. A new request supersedes any pending one.
export const beginPairing = async (
  client: ClientIdentity,
  now: number,
): Promise<BeginPairingResult> => {
  const code = generatePairingCode()
  const codeHash = await sha256Hex(code)
  const pairingId = crypto.randomUUID()
  const expiresAt = now + PAIRING_TTL_MS

  const pending: PendingPairing = {
    pairingId,
    codeHash,
    expiresAt,
    attempts: 0,
    client: { name: client.name, instanceId: client.instanceId },
  }
  await setFeatureState<PendingPairing>(NATIVE_MESSAGING_FEATURE_ID, pending)

  const blocks: ContentBlock[] = [{ type: "markdown", text: `# ${code}` }]
  // ponytail: modal shows on every tab with a SurfaceHost (no urlMatch). The
  // chrome:// fallback page is a v2 concern; the focused tab is what matters and
  // the modal self-clears in 60s.
  await upsertSurface(NATIVE_MESSAGING_FEATURE_ID, {
    id: PAIRING_MODAL_ID,
    kind: "modal",
    content: {
      icon: "Link",
      title: `Pair “${client.name}”`,
      text: `Enter this code in ${client.name} to connect:`,
      countdownTo: expiresAt,
      blocks,
    },
  })

  return { pairingId, expiresInSeconds: Math.round(PAIRING_TTL_MS / 1000) }
}

// Verify the human-entered code and, on success, mint + persist a token hash.
export const submitCode = async (
  pairingId: string,
  code: string,
  now: number,
): Promise<SubmitCodeResult> => {
  const pending = await getFeatureState<PendingPairing>(
    NATIVE_MESSAGING_FEATURE_ID,
  )

  if (!pending || pending.pairingId !== pairingId) {
    return { ok: false, code: "pairing_rejected" }
  }

  if (now > pending.expiresAt) {
    await clearPending()
    return { ok: false, code: "pairing_expired" }
  }

  const matches = constantTimeEqual(await sha256Hex(code), pending.codeHash)
  if (!matches) {
    const attempts = pending.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      await clearPending()
      return { ok: false, code: "pairing_rejected" }
    }
    await setFeatureState<PendingPairing>(NATIVE_MESSAGING_FEATURE_ID, {
      ...pending,
      attempts,
    })
    return { ok: false, code: "pairing_rejected" }
  }

  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const scopes: BridgeScope[] = [...BRIDGE_SCOPES]

  const client: PairedClient = {
    instanceId: pending.client.instanceId,
    name: pending.client.name,
    tokenHash,
    scopes,
    createdAt: now,
  }

  const config = await readConfig()
  const pairedClients = [
    ...config.pairedClients.filter((c) => c.instanceId !== client.instanceId),
    client,
  ]
  await setFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, {
    ...config,
    pairedClients,
  })

  await clearPending()
  return { ok: true, token, scopes }
}

// Startup/teardown cleanup of any stale pairing modal + pending state.
export const clearStalePairing = clearPending
