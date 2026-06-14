// Architecture: background command system, "extensions" category. An
// Extensity-style extension manager expressed as nested command groups:
//
//   Extensions (group, requires the optional "management" permission)
//   ├─ Enable all extensions        (action)
//   ├─ Disable all extensions       (action)
//   └─ <Each installed extension>   (group)
//      ├─ Enable / Disable          (action — toggles current state)
//      ├─ Launch app                (action — apps only)
//      ├─ Open options              (action — if the extension has options)
//      ├─ Open details page         (action)
//      ├─ Open homepage             (action — if declared)
//      └─ Uninstall                 (action — confirm-gated)
//
// All extension state comes from chrome.management via background/utils/
// browserManagement.ts. Each extension's action page re-reads that extension by
// id, so enable/disable labels stay correct even after toggling elsewhere.
// See docs/commands/extensions.md.
import type {
  ActionCommandNode,
  CommandNode,
  GroupCommandNode,
} from "../../../shared/types"
import {
  createTab,
  getAllExtensions,
  getExtension,
  getSelfExtension,
  isExtensionApp,
  launchApp,
  type ManagedExtension,
  pickExtensionIconUrl,
  sendToastToActiveTab,
  setExtensionEnabled,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"

// chrome://extensions deep-links to a single extension. (This feature is
// Chrome-only — see the supportedBrowsers note on extensionsGroup — so there is
// no Firefox about:addons branch; Firefox forbids navigating to about: pages.)
const detailsUrl = (id: string): string => `chrome://extensions/?id=${id}`

const statusDescription = (extension: ManagedExtension): string =>
  `${extension.enabled ? "Enabled" : "Disabled"} • v${extension.version}`

const iconFor = (extension: ManagedExtension): CommandNode["icon"] => {
  const url = pickExtensionIconUrl(extension)
  return url ? { type: "url", url } : { type: "lucide", name: "Puzzle" }
}

// Dynamic per-extension ids change as extensions are installed/removed, so
// they opt out of custom keybindings and durable settings rows.
const dynamicMeta = {
  allowCustomKeybinding: false,
  settingsCatalog: { configurable: false },
} as const

const buildExtensionActions = (extension: ManagedExtension): CommandNode[] => {
  const actions: ActionCommandNode[] = []

  if (extension.mayDisable) {
    const willEnable = !extension.enabled
    actions.push({
      type: "action",
      id: `extension-${extension.id}-toggle`,
      name: willEnable ? "Enable" : "Disable",
      description: willEnable
        ? `Turn on ${extension.name}`
        : `Turn off ${extension.name}`,
      icon: willEnable
        ? { type: "lucide", name: "Check" }
        : { type: "lucide", name: "X" },
      color: willEnable ? "green" : "gray",
      actionLabel: willEnable ? "Enable" : "Disable",
      // Stay open after toggling so the user can flip several extensions in a
      // row; selectCommand then calls refreshCurrentPage, which re-resolves
      // this page's children (children() re-reads the extension via getExtension)
      // so the Enable/Disable label updates in place. See docs/execution-and-actions.md.
      remainOpenOnSelect: true,
      ...dynamicMeta,
      execute: async () => {
        try {
          await setExtensionEnabled(extension.id, willEnable)
          await sendToastToActiveTab(
            "success",
            `${willEnable ? "Enabled" : "Disabled"} ${extension.name}`,
          )
        } catch (error) {
          console.error("Failed to toggle extension:", error)
          await sendToastToActiveTab(
            "error",
            `Failed to ${willEnable ? "enable" : "disable"} ${extension.name}`,
          )
        }
      },
    })
  }

  if (isExtensionApp(extension) && extension.enabled) {
    actions.push({
      type: "action",
      id: `extension-${extension.id}-launch`,
      name: "Launch app",
      icon: { type: "lucide", name: "Rocket" },
      color: "blue",
      actionLabel: "Launch",
      ...dynamicMeta,
      execute: async () => {
        try {
          await launchApp(extension.id)
        } catch (error) {
          console.error("Failed to launch app:", error)
          await sendToastToActiveTab(
            "error",
            `Failed to launch ${extension.name}`,
          )
        }
      },
    })
  }

  if (extension.optionsUrl) {
    const optionsUrl = extension.optionsUrl
    actions.push({
      type: "action",
      id: `extension-${extension.id}-options`,
      name: "Open options",
      icon: { type: "lucide", name: "Settings" },
      color: "blue",
      actionLabel: "Open",
      ...dynamicMeta,
      execute: async () => {
        await createTab({ url: optionsUrl, active: true })
      },
    })
  }

  if (extension.homepageUrl) {
    const homepageUrl = extension.homepageUrl
    actions.push({
      type: "action",
      id: `extension-${extension.id}-homepage`,
      name: "Open homepage",
      icon: { type: "lucide", name: "Globe" },
      color: "blue",
      actionLabel: "Open",
      ...dynamicMeta,
      execute: async () => {
        await createTab({ url: homepageUrl, active: true })
      },
    })
  }

  // chrome.management.uninstall requires a transient user gesture, which a
  // background message handler does not have (the keypress activation does not
  // survive the round-trip to the service worker). So instead of calling it and
  // failing, open the extension's Chrome page — its Remove button (and full
  // details/permissions) live there. This page also covers the "view details"
  // intent, so there is no separate details action.
  actions.push({
    type: "action",
    id: `extension-${extension.id}-uninstall`,
    name: "Uninstall…",
    description: `Open ${extension.name}'s Chrome page to remove it`,
    icon: { type: "lucide", name: "Trash2" },
    color: "red",
    actionLabel: "Open page",
    keywords: ["uninstall", "remove", "delete", "details", "manage"],
    ...dynamicMeta,
    execute: async () => {
      await createTab({ url: detailsUrl(extension.id), active: true })
    },
  })

  return actions
}

const buildExtensionGroup = (
  extension: ManagedExtension,
): GroupCommandNode => ({
  type: "group",
  id: `extension-${extension.id}`,
  name: extension.name,
  description: statusDescription(extension),
  icon: iconFor(extension),
  color: extension.enabled ? "green" : "gray",
  keywords: [
    extension.name.toLowerCase(),
    "extension",
    extension.enabled ? "enabled" : "disabled",
    isExtensionApp(extension) ? "app" : "extension",
  ],
  ...dynamicMeta,
  // Re-read fresh state on open so the Enable/Disable label is never stale.
  children: async () => {
    const fresh = (await getExtension(extension.id)) ?? extension
    return buildExtensionActions(fresh)
  },
})

const bulkSetEnabled = async (
  extensions: ManagedExtension[],
  enabled: boolean,
): Promise<number> => {
  let changed = 0
  for (const extension of extensions) {
    if (!extension.mayDisable || extension.enabled === enabled) {
      continue
    }
    try {
      await setExtensionEnabled(extension.id, enabled)
      changed += 1
    } catch (error) {
      console.error(
        `Failed to ${enabled ? "enable" : "disable"} extension:`,
        error,
      )
    }
  }
  return changed
}

const createBulkAction = (
  enabled: boolean,
  getExtensions: () => Promise<ManagedExtension[]>,
): ActionCommandNode => ({
  type: "action",
  id: enabled ? "extensions-enable-all" : "extensions-disable-all",
  name: enabled ? "Enable all extensions" : "Disable all extensions",
  description: enabled
    ? "Turn on every extension that can be toggled"
    : "Turn off every extension that can be toggled",
  icon: enabled
    ? { type: "lucide", name: "Check" }
    : { type: "lucide", name: "X" },
  color: enabled ? "green" : "amber",
  actionLabel: enabled ? "Enable all" : "Disable all",
  // Stay open + refresh so every extension's status updates in place.
  remainOpenOnSelect: true,
  ...dynamicMeta,
  execute: async () => {
    const changed = await bulkSetEnabled(await getExtensions(), enabled)
    await sendToastToActiveTab(
      "success",
      `${enabled ? "Enabled" : "Disabled"} ${changed} extension${changed === 1 ? "" : "s"}`,
    )
  },
})

/** Installed, user-manageable extensions/apps — excludes Monocle and themes. */
const listManageableExtensions = async (): Promise<ManagedExtension[]> => {
  const [all, self] = await Promise.all([
    getAllExtensions(),
    getSelfExtension(),
  ])
  return all
    .filter((extension) => extension.id !== self?.id)
    .filter((extension) => extension.type !== "theme")
    .sort((a, b) => a.name.localeCompare(b.name))
}

const extensionsGroup: GroupCommandNode = {
  type: "group",
  id: "extensions",
  name: "Extensions",
  description: "Enable, disable, and manage your browser extensions",
  icon: { type: "lucide", name: "Puzzle" },
  color: "purple",
  // Chrome-only. Firefox's chrome.management implements only the read methods
  // (getAll/get/getSelf); it deliberately omits setEnabled/uninstall/launchApp,
  // so an extension cannot enable/disable/uninstall *other* add-ons there — and
  // about:addons cannot be opened from an extension. Every action this group
  // offers would fail on Firefox, so the whole group is hidden there.
  supportedBrowsers: ["chrome"],
  permissions: ["management"],
  keywords: ["extensions", "addons", "add-ons", "manage", "enable", "disable"],
  children: async () => {
    try {
      const extensions = await listManageableExtensions()

      if (extensions.length === 0) {
        return [
          createNoOpCommand(
            "no-extensions",
            "No extensions found",
            "No other extensions are installed",
            { type: "lucide", name: "Puzzle" },
          ),
        ]
      }

      return [
        createBulkAction(true, listManageableExtensions),
        createBulkAction(false, listManageableExtensions),
        ...extensions.map(buildExtensionGroup),
      ]
    } catch (error) {
      console.error("Failed to load extensions:", error)
      return [
        createNoOpCommand(
          "extensions-error",
          "Error loading extensions",
          "Could not read installed extensions. The management permission may be missing.",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}

export const extensionsCommands: CommandNode[] = [extensionsGroup]
