// Architecture: background feature layer (extension-to-extension). The palette
// commands that toggle the feature. No optional permission to request —
// cross-extension messaging is a static manifest capability. Disabling also
// drops cached peer trees and rebuilds the search index; like the native
// bridge, the palette command performs those side effects itself, because
// onConfigChange only fires on the settings-page path
// (monocle-feature-config-update). See
// docs/extension-extension/extension-integration.md.
import type { ActionCommandNode, CommandNode } from "../../../shared/types"
import { sendToastToActiveTab } from "../../utils/browserTabs"
import { updateFeatureConfig } from "../config"
import { dropAllPeerTrees } from "./cleanup"
import {
  EXTENSION_REGISTRY_FEATURE_ID,
  type ExtensionRegistryConfig,
  extensionRegistryConfigDefaults,
} from "./types"

const setEnabled = async (enabled: boolean): Promise<void> => {
  await updateFeatureConfig<ExtensionRegistryConfig>(
    EXTENSION_REGISTRY_FEATURE_ID,
    extensionRegistryConfigDefaults,
    (config) => ({ ...config, enabled }),
  )
}

const enableCommand: ActionCommandNode = {
  id: "external-extensions-enable",
  type: "action",
  name: "Enable extension integrations",
  description: "Let approved browser extensions add commands to Monocle",
  icon: { type: "lucide", name: "Puzzle" },
  keywords: ["extension", "integration", "external", "commands"],
  execute: async () => {
    await setEnabled(true)
    await sendToastToActiveTab("success", "Extension integrations enabled")
  },
}

const disableCommand: ActionCommandNode = {
  id: "external-extensions-disable",
  type: "action",
  name: "Disable extension integrations",
  description: "Stop other extensions from adding commands",
  icon: { type: "lucide", name: "Puzzle" },
  keywords: ["extension", "integration", "external", "commands"],
  execute: async () => {
    await setEnabled(false)
    await dropAllPeerTrees()
    await sendToastToActiveTab("info", "Extension integrations disabled")
  },
}

export const extensionRegistryCommands = (): CommandNode[] => [
  enableCommand,
  disableCommand,
]
