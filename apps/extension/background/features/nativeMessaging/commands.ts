// Architecture: background feature layer (Native Messaging bridge). The palette
// commands that toggle the bridge. Enable declares the nativeMessaging + tabs
// permissions so the palette's existing permission-grant flow requests them on
// first run; its execute flips the opt-in flag and opens the host port. Disable
// flips it back and tears the port down. See docs/native-messaging/.
import type { ActionCommandNode, CommandNode } from "../../../shared/types"
import { sendToastToActiveTab } from "../../utils/browserTabs"
import { updateFeatureConfig } from "../config"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  type NativeMessagingConfig,
  nativeMessagingConfigDefaults,
} from "./types"

const setEnabled = async (enabled: boolean): Promise<void> => {
  await updateFeatureConfig<NativeMessagingConfig>(
    NATIVE_MESSAGING_FEATURE_ID,
    nativeMessagingConfigDefaults,
    (config) => ({ ...config, enabled }),
  )
}

const enableCommand: ActionCommandNode = {
  id: "native-messaging-enable",
  type: "action",
  name: "Enable native bridge",
  description: "Let paired desktop apps read this tab's commands",
  icon: { type: "lucide", name: "Link" },
  keywords: ["native", "bridge", "raycast", "desktop", "messaging"],
  permissions: ["nativeMessaging", "tabs"],
  execute: async () => {
    await setEnabled(true)
    // Lazy import: keeps the port -> pump -> command-system chain out of the
    // feature registry's static import graph (avoids a load-time cycle).
    const { connectBridge } = await import("./port")
    await connectBridge()
    await sendToastToActiveTab("success", "Native bridge enabled")
  },
}

const disableCommand: ActionCommandNode = {
  id: "native-messaging-disable",
  type: "action",
  name: "Disable native bridge",
  description: "Stop desktop apps from reaching Monocle",
  icon: { type: "lucide", name: "Link" },
  keywords: ["native", "bridge", "raycast", "desktop", "messaging"],
  execute: async () => {
    await setEnabled(false)
    const { disconnectBridge } = await import("./port")
    disconnectBridge()
    await sendToastToActiveTab("info", "Native bridge disabled")
  },
}

export const nativeMessagingCommands = (): CommandNode[] => [
  enableCommand,
  disableCommand,
]
