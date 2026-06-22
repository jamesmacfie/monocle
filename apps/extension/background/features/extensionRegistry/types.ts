// Architecture: background feature layer (extension-to-extension). Durable
// config + transient pending state shapes for the peer-extension registry.
// Config holds the master opt-in and the approved allowlist (the browser-
// verified extension id IS the identity — no token, no code). Pending
// announcements are transient (feature-state), cleared on startup; a peer
// re-announces on its next load. See docs/extension-extension/registration-and-trust.md.
import { z } from "zod"

export const EXTENSION_REGISTRY_FEATURE_ID = "external-extensions"

// An extension the user has approved to contribute commands. `name` is the
// display name claimed at approval time (display-only; the id is the identity).
export type ApprovedPeer = {
  extId: string
  name: string
  approvedAt: number
  lastSeenAt?: number
}

export type ExtensionRegistryConfig = {
  enabled: boolean
  approved: ApprovedPeer[]
}

export const extensionRegistryConfigDefaults: ExtensionRegistryConfig = {
  enabled: false,
  approved: [],
}

const approvedPeerSchema = z.object({
  extId: z.string().min(1),
  name: z.string().min(1),
  approvedAt: z.number(),
  lastSeenAt: z.number().optional(),
})

export const extensionRegistryConfigSchema = z.object({
  enabled: z.boolean(),
  approved: z.array(approvedPeerSchema).max(50),
})

// A peer that announced but is not yet approved. Transient (feature-state),
// keyed by extId. `name`/`description` are "as claimed by <extId>".
export type PendingPeer = {
  extId: string
  name: string
  description?: string
  announcedAt: number
}

export type PendingPeers = PendingPeer[]
