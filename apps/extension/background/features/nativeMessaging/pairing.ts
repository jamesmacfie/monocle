// Architecture: background feature layer (Native Messaging bridge). The
// bluetooth-style pairing flow, Direction B: the confirmation code travels
// extension → app → human → browser. beginPairing generates a code, returns it
// to the app to DISPLAY, and records a pending request. The human reads the code
// from the app and types it on the browser's Integrations page; acceptPairing
// verifies it (constant-time over hashes), mints a scoped bearer token, and
// stashes the plaintext on the pending record. The app collects the token
// EXACTLY ONCE via pollStatus, which then drops the record. See
// docs/native-messaging/authentication-and-security.md.
import {
  BRIDGE_SCOPES,
  type BridgeScope,
  type ClientIdentity,
} from "../../../shared/types"
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
  type PendingPairings,
} from "./types"

const PAIRING_TTL_MS = 60_000
const MAX_ATTEMPTS = 5

export type BeginPairingResult = {
  pairingId: string
  code: string
  expiresInSeconds: number
}

export type AcceptPairingResult =
  | { ok: true }
  | { ok: false; code: "pairing_rejected" | "pairing_expired" }

export type PollStatusResult =
  | { status: "pending" }
  | { status: "approved"; token: string; scopes: BridgeScope[] }
  | { status: "expired" }
  | { status: "rejected" }

const readConfig = (): Promise<NativeMessagingConfig> =>
  getFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, nativeMessagingConfigDefaults)

const readPending = async (): Promise<PendingPairings> =>
  (await getFeatureState<PendingPairings>(NATIVE_MESSAGING_FEATURE_ID)) ?? []

const writePending = (pending: PendingPairings): Promise<void> =>
  setFeatureState<PendingPairings>(NATIVE_MESSAGING_FEATURE_ID, pending)

// Pending requests still within their TTL, for the Integrations page list.
// Expired records are not surfaced (and are pruned lazily on the next write).
export const getPendingPairings = async (
  now: number = Date.now(),
): Promise<PendingPairing[]> => {
  const pending = await readPending()
  return pending.filter((p) => now <= p.expiresAt)
}

// Begin pairing: generate a code, record it (hashed) as a pending request, and
// return the plaintext code for the app to display. A new request from the same
// instanceId supersedes its prior pending record.
export const beginPairing = async (
  client: ClientIdentity,
  now: number,
): Promise<BeginPairingResult> => {
  const code = generatePairingCode()
  const codeHash = await sha256Hex(code)
  const pairingId = crypto.randomUUID()
  const expiresAt = now + PAIRING_TTL_MS

  const record: PendingPairing = {
    pairingId,
    codeHash,
    expiresAt,
    attempts: 0,
    status: "pending",
    client: { name: client.name, instanceId: client.instanceId },
  }

  const pending = (await readPending()).filter(
    (p) => now <= p.expiresAt && p.client.instanceId !== client.instanceId,
  )
  await writePending([...pending, record])

  return {
    pairingId,
    code,
    expiresInSeconds: Math.round(PAIRING_TTL_MS / 1000),
  }
}

// Verify the human-entered code (typed on the Integrations page) and, on
// success, mint + persist a token hash and stash the plaintext on the pending
// record for the app to collect via pollStatus.
export const acceptPairing = async (
  pairingId: string,
  code: string,
  now: number,
): Promise<AcceptPairingResult> => {
  const pending = await readPending()
  const record = pending.find((p) => p.pairingId === pairingId)

  if (!record || record.status === "approved") {
    return { ok: false, code: "pairing_rejected" }
  }

  if (now > record.expiresAt) {
    await writePending(pending.filter((p) => p.pairingId !== pairingId))
    return { ok: false, code: "pairing_expired" }
  }

  const matches = constantTimeEqual(await sha256Hex(code), record.codeHash)
  if (!matches) {
    const attempts = record.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      await writePending(pending.filter((p) => p.pairingId !== pairingId))
      return { ok: false, code: "pairing_rejected" }
    }
    await writePending(
      pending.map((p) => (p.pairingId === pairingId ? { ...p, attempts } : p)),
    )
    return { ok: false, code: "pairing_rejected" }
  }

  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const scopes: BridgeScope[] = [...BRIDGE_SCOPES]

  const client: PairedClient = {
    instanceId: record.client.instanceId,
    name: record.client.name,
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

  await writePending(
    pending.map((p) =>
      p.pairingId === pairingId
        ? { ...p, status: "approved" as const, approvedToken: token }
        : p,
    ),
  )

  return { ok: true }
}

// Reject (or dismiss) a pending request from the Integrations page.
export const rejectPairing = async (pairingId: string): Promise<void> => {
  const pending = await readPending()
  await writePending(pending.filter((p) => p.pairingId !== pairingId))
}

// The app polls this after pair/request. Returns the minted token EXACTLY ONCE
// (the record is dropped on read), otherwise pending/expired/rejected.
export const pollStatus = async (
  pairingId: string,
  now: number,
): Promise<PollStatusResult> => {
  const pending = await readPending()
  const record = pending.find((p) => p.pairingId === pairingId)

  if (!record) {
    // Unknown id: either rejected/collected or never existed. "rejected" is the
    // honest answer for a request the user dismissed; the app treats both ends
    // the same (stop polling).
    return { status: "rejected" }
  }

  if (record.status === "approved" && record.approvedToken) {
    await writePending(pending.filter((p) => p.pairingId !== pairingId))
    return {
      status: "approved",
      token: record.approvedToken,
      scopes: [...BRIDGE_SCOPES],
    }
  }

  if (now > record.expiresAt) {
    await writePending(pending.filter((p) => p.pairingId !== pairingId))
    return { status: "expired" }
  }

  return { status: "pending" }
}

// Startup/teardown cleanup of all pending pairing state.
export const clearStalePairing = (): Promise<void> =>
  clearFeatureState(NATIVE_MESSAGING_FEATURE_ID)
