// Architecture: background feature layer (extension-to-extension). The palette
// commands that toggle the feature. No optional permission to request —
// cross-extension messaging is a static manifest capability — so enable/disable
// only flip the opt-in flag (disabling also drops cached peer trees, handled by
// the module's onConfigChange). See docs/extension-extension/extension-integration.md.
import type { ActionCommandNode, CommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"
import { getFeatureConfig, setFeatureConfig } from "../config"
import {
  EXTENSION_REGISTRY_FEATURE_ID,
  type ExtensionRegistryConfig,
  extensionRegistryConfigDefaults,
} from "./types"

const toast = async (
  level: "info" | "success" | "warning" | "error",
  message: string,
): Promise<void> => {
  const tab = await getActiveTab()
  if (tab?.id) {
    await sendTabMessage(tab.id, { type: "monocle-toast", level, message })
  }
}

const setEnabled = async (enabled: boolean): Promise<void> => {
  const config = await getFeatureConfig<ExtensionRegistryConfig>(
    EXTENSION_REGISTRY_FEATURE_ID,
    extensionRegistryConfigDefaults,
  )
  await setFeatureConfig(EXTENSION_REGISTRY_FEATURE_ID, { ...config, enabled })
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
    await toast("success", "Extension integrations enabled")
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
    await toast("info", "Extension integrations disabled")
  },
}

export const extensionRegistryCommands = (): CommandNode[] => [
  enableCommand,
  disableCommand,
]
