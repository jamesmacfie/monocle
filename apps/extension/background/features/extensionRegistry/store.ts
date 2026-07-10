// Architecture: background feature layer (extension-to-extension). The data
// layer over the peer-extension config (durable allowlist) and state (transient
// pending announcements). Used by the cross-extension message handler and the
// feature's settings-page actions. Clearing a peer's approval also drops its
// cached command tree (registry) and rebuilds the search index — done by the
// caller (handleAction) which can import the registry without a cycle. See
// docs/extension-extension/registration-and-trust.md.
import { getFeatureConfig, updateFeatureConfig } from "../config"
import { getFeatureState, updateFeatureState } from "../state"
import {
  type ApprovedPeer,
  EXTENSION_REGISTRY_FEATURE_ID,
  type ExtensionRegistryConfig,
  extensionRegistryConfigDefaults,
  type PendingPeer,
  type PendingPeers,
} from "./types"

const MAX_PENDING = 20

const readConfig = (): Promise<ExtensionRegistryConfig> =>
  getFeatureConfig(
    EXTENSION_REGISTRY_FEATURE_ID,
    extensionRegistryConfigDefaults,
  )

export const isExtensionRegistryEnabled = async (): Promise<boolean> =>
  (await readConfig()).enabled

export const listApprovedPeers = async (): Promise<ApprovedPeer[]> =>
  (await readConfig()).approved

export const isPeerApproved = async (extId: string): Promise<boolean> =>
  (await readConfig()).approved.some((peer) => peer.extId === extId)

const readPending = async (): Promise<PendingPeers> =>
  (await getFeatureState<PendingPeers>(EXTENSION_REGISTRY_FEATURE_ID)) ?? []

export const listPendingPeers = (): Promise<PendingPeer[]> => readPending()

// Record (or refresh) a pending announcement. A new announce from the same id
// supersedes its prior pending row. No-op if already approved.
export const addPendingPeer = async (peer: PendingPeer): Promise<void> => {
  if (await isPeerApproved(peer.extId)) {
    return
  }
  await updateFeatureState<PendingPeers>(
    EXTENSION_REGISTRY_FEATURE_ID,
    (state) => {
      const pending = (state ?? []).filter((p) => p.extId !== peer.extId)
      // Cap pending so a misbehaving peer (or many) cannot grow state unbounded.
      return [...pending, peer].slice(-MAX_PENDING)
    },
  )
}

// Approve a pending peer: move it onto the durable allowlist and drop the
// pending row. Returns false if it was not pending (nothing to approve).
export const approvePeer = async (extId: string): Promise<boolean> => {
  const pending = await readPending()
  const peer = pending.find((p) => p.extId === extId)
  if (!peer) {
    return false
  }

  const approved: ApprovedPeer = {
    extId,
    name: peer.name,
    approvedAt: Date.now(),
  }
  await updateFeatureConfig(
    EXTENSION_REGISTRY_FEATURE_ID,
    extensionRegistryConfigDefaults,
    (config) => ({
      ...config,
      approved: [...config.approved.filter((p) => p.extId !== extId), approved],
    }),
  )
  await updateFeatureState<PendingPeers>(
    EXTENSION_REGISTRY_FEATURE_ID,
    (state) => (state ?? []).filter((p) => p.extId !== extId),
  )
  return true
}

export const dismissPendingPeer = async (extId: string): Promise<void> => {
  await updateFeatureState<PendingPeers>(
    EXTENSION_REGISTRY_FEATURE_ID,
    (state) => (state ?? []).filter((p) => p.extId !== extId),
  )
}

// Revoke approval. The caller also drops the peer's cached tree + rebuilds the
// search index (kept out of here to avoid a registry import cycle).
export const revokePeer = async (extId: string): Promise<void> => {
  await updateFeatureConfig(
    EXTENSION_REGISTRY_FEATURE_ID,
    extensionRegistryConfigDefaults,
    (config) => ({
      ...config,
      approved: config.approved.filter((p) => p.extId !== extId),
    }),
  )
}

// Best-effort last-seen stamp for an approved peer (on register/announce).
export const touchPeerSeen = async (extId: string): Promise<void> => {
  await updateFeatureConfig(
    EXTENSION_REGISTRY_FEATURE_ID,
    extensionRegistryConfigDefaults,
    (config) => {
      if (!config.approved.some((p) => p.extId === extId)) {
        return config
      }
      return {
        ...config,
        approved: config.approved.map((p) =>
          p.extId === extId ? { ...p, lastSeenAt: Date.now() } : p,
        ),
      }
    },
  )
}

export const clearPendingPeers = (): Promise<void> =>
  updateFeatureState<PendingPeers>(
    EXTENSION_REGISTRY_FEATURE_ID,
    () => undefined,
  )
