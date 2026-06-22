// Architecture: background feature layer (Native Messaging bridge). The
// FeatureModule that ties the bridge together: the enable/disable palette
// commands, a settings page (opt-in toggle + paired-client list with per-row
// Revoke), the startup hook (clear any stale pairing modal, reconnect if
// enabled), and the connect/disconnect reaction to the opt-in flag. Registered
// in background/features/index.ts. See docs/native-messaging/.
import type { RecordListItem } from "../../../shared/types"
import { getFeatureConfig, setFeatureConfig } from "../config"
import type { FeatureModule } from "../types"
import { nativeMessagingCommands } from "./commands"
import {
  acceptPairing,
  clearStalePairing,
  getPendingPairings,
  rejectPairing,
} from "./pairing"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  type NativeMessagingConfig,
  nativeMessagingConfigDefaults,
  nativeMessagingConfigSchema,
} from "./types"

// Both record-list fields the Integrations page renders: apps still requesting
// access (pending, from transient state) and apps that completed pairing
// (connected, from durable config).
const projectLists = async (
  config: NativeMessagingConfig,
): Promise<Record<string, RecordListItem[]>> => ({
  pendingRequests: (await getPendingPairings()).map((p) => ({
    id: p.pairingId,
    label: p.client.name,
    sublabel: "Requesting access",
  })),
  pairedClients: config.pairedClients.map((client) => ({
    id: client.instanceId,
    label: client.name,
    sublabel: client.lastUsedAt
      ? `Last used ${new Date(client.lastUsedAt).toLocaleString()}`
      : "Never used",
  })),
})

export const nativeMessagingFeature: FeatureModule<NativeMessagingConfig> = {
  id: NATIVE_MESSAGING_FEATURE_ID,
  name: "Native Bridge",
  description: "Let paired desktop apps (e.g. Raycast) read tab commands",
  icon: { type: "lucide", name: "Link" },
  // UI lives on the bespoke Integrations page (pending requests + code entry +
  // connected apps), not the generic Features page.
  hiddenFromFeaturesPage: true,
  commands: () => nativeMessagingCommands(),
  init: async () => {
    // Drop any pairing modal/pending left over from a previous session.
    await clearStalePairing()
    const config = await getFeatureConfig(
      NATIVE_MESSAGING_FEATURE_ID,
      nativeMessagingConfigDefaults,
    )
    if (config.enabled) {
      // Lazy import: keeps the port -> pump -> command-system chain out of the
      // feature registry's static import graph (avoids a load-time cycle).
      const { connectBridge } = await import("./port")
      await connectBridge()
    }
  },
  settings: {
    configSchema: nativeMessagingConfigSchema,
    defaults: nativeMessagingConfigDefaults,
    lists: (config) => projectLists(config),
    schema: {
      sections: [
        {
          title: "Native bridge",
          description:
            "When enabled, a paired desktop app can read the active tab's commands over a local native-messaging connection. Off by default. Requires the native host to be installed.",
          fields: [
            {
              id: "enabled",
              label: "Enable native bridge",
              type: "switch",
            },
          ],
        },
        {
          title: "Command execution",
          description:
            "Allow paired apps to RUN commands on the active tab (not just read them) — e.g. copy the page as Markdown into the app, reload, switch tabs. Off by default. Confirmation-gated and destructive commands are always refused.",
          fields: [
            {
              id: "allowExecution",
              label: "Allow paired apps to run commands",
              type: "switch",
            },
          ],
        },
        {
          title: "Paired apps",
          description:
            "Apps that completed pairing. Revoke to invalidate an app's token; it must pair again to reconnect.",
          fields: [
            {
              id: "pairedClients",
              label: "Paired apps",
              type: "record-list",
              emptyText: "No paired apps yet.",
              itemActions: [{ id: "revoke", label: "Revoke", style: "danger" }],
            },
          ],
        },
      ],
    },
    handleAction: async (actionId, { payload }) => {
      const itemId = typeof payload?.itemId === "string" ? payload.itemId : ""

      // Accept a pending request: verify the code the human typed on the
      // Integrations page (itemId is the pairingId, value is the code). Throw on
      // a bad/expired code so the options page can surface it.
      if (actionId === "accept") {
        if (!itemId) {
          return
        }
        const code = typeof payload?.value === "string" ? payload.value : ""
        const result = await acceptPairing(itemId, code, Date.now())
        if (!result.ok) {
          throw new Error(
            result.code === "pairing_expired"
              ? "Pairing request expired"
              : "Incorrect code",
          )
        }
        return
      }

      // Reject/dismiss a pending request.
      if (actionId === "reject") {
        if (itemId) {
          await rejectPairing(itemId)
        }
        return
      }

      // Revoke a connected app's token (itemId is the instanceId).
      if (actionId !== "revoke" || !itemId) {
        return
      }
      const config = await getFeatureConfig(
        NATIVE_MESSAGING_FEATURE_ID,
        nativeMessagingConfigDefaults,
      )
      await setFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, {
        ...config,
        pairedClients: config.pairedClients.filter(
          (client) => client.instanceId !== itemId,
        ),
      })
    },
    // The opt-in flag is the single source of truth for whether the port is
    // open. React to settings-page toggles here (the palette commands open/close
    // the port directly themselves).
    onConfigChange: async (config) => {
      const { connectBridge, disconnectBridge } = await import("./port")
      if (config.enabled) {
        await connectBridge()
      } else {
        disconnectBridge()
      }
    },
  },
}
