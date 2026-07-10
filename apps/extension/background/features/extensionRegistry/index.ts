// Architecture: background feature layer (extension-to-extension). The
// FeatureModule that ties the peer-extension registry together: the
// enable/disable palette commands, the settings surface (rendered on the
// bespoke Integrations page, not the generic Features page) listing pending +
// approved peers, the approve/dismiss/revoke actions, and the disable cleanup
// that drops cached trees. The cross-extension transport itself lives in
// handler.ts (peer→Monocle) and extensionSdk/transport.ts (Monocle→peer),
// registered from background/index.ts. See docs/extension-extension/.
import type { RecordListItem } from "../../../shared/types"
import { clearExtensionRegistrations } from "../../commands/extensionSdk"
import type { FeatureModule } from "../types"
import { dropAllPeerTrees } from "./cleanup"
import { extensionRegistryCommands } from "./commands"
import {
  approvePeer,
  clearPendingPeers,
  dismissPendingPeer,
  listApprovedPeers,
  listPendingPeers,
  revokePeer,
} from "./store"
import {
  EXTENSION_REGISTRY_FEATURE_ID,
  type ExtensionRegistryConfig,
  extensionRegistryConfigDefaults,
  extensionRegistryConfigSchema,
} from "./types"

// Rebuild the search index after a registry mutation, via dynamic import to
// avoid the static cycle (features → … → searchIndex → source → features).
const rebuildIndex = async (): Promise<void> => {
  const { invalidateSearchIndex } = await import("../../commands/searchIndex")
  invalidateSearchIndex()
}

// Both record-list fields the Integrations page renders: peers requesting access
// (pending, transient state) and approved peers (durable config).
const projectLists = async (): Promise<Record<string, RecordListItem[]>> => ({
  pending: (await listPendingPeers()).map((peer) => ({
    id: peer.extId,
    label: peer.name,
    sublabel: `Claimed by ${peer.extId}`,
  })),
  approved: (await listApprovedPeers()).map((peer) => ({
    id: peer.extId,
    label: peer.name,
    sublabel: peer.lastSeenAt
      ? `Last seen ${new Date(peer.lastSeenAt).toLocaleString()}`
      : "Never seen",
  })),
})

export const extensionRegistryFeature: FeatureModule<ExtensionRegistryConfig> =
  {
    id: EXTENSION_REGISTRY_FEATURE_ID,
    name: "Extensions",
    description: "Let approved browser extensions add commands to Monocle",
    icon: { type: "lucide", name: "Puzzle" },
    // Managed on the bespoke Integrations page (pending/approved + Approve/Revoke),
    // not the generic Features page.
    hiddenFromFeaturesPage: true,
    // Pending announcements are transient — drop any left from a previous session
    // (peers re-announce on their next load).
    init: () => clearPendingPeers(),
    commands: () => extensionRegistryCommands(),
    settings: {
      configSchema: extensionRegistryConfigSchema,
      defaults: extensionRegistryConfigDefaults,
      lists: () => projectLists(),
      schema: {
        sections: [
          {
            title: "Extension integrations",
            description:
              "When enabled, other browser extensions can request to add commands to Monocle. You approve each one below — the browser-verified extension id is its identity, so no pairing code is needed. Off by default.",
            fields: [
              {
                id: "enabled",
                label: "Allow other extensions to add commands",
                type: "switch",
              },
            ],
          },
        ],
      },
      handleAction: async (actionId, { payload }) => {
        const extId = typeof payload?.itemId === "string" ? payload.itemId : ""
        if (!extId) {
          return
        }
        if (actionId === "approve") {
          await approvePeer(extId)
          return
        }
        if (actionId === "dismiss") {
          await dismissPendingPeer(extId)
          return
        }
        if (actionId === "revoke") {
          await revokePeer(extId)
          await clearExtensionRegistrations(extId)
          await rebuildIndex()
        }
      },
      // Turning the feature off drops every approved peer's cached command tree
      // (they re-register when re-enabled). Approval is kept.
      onConfigChange: async (config) => {
        if (!config.enabled) {
          await dropAllPeerTrees()
        }
      },
    },
  }
