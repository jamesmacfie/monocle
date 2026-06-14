// Architecture: background feature layer (Tab Groups). The cross-browser
// saved-collection palette commands: save the focused window as a named group,
// and restore a saved group (all tabs, or one at a time). Native Chrome
// tab-strip commands live in nativeCommands.ts. See docs/features.md.
import type { CommandNode, GroupCommandNode } from "../../../shared/types"
import {
  createTab,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import { createConfigureFeatureCommand } from "../configureCommand"
import { captureCurrentWindow, closeTabs, restoreGroup } from "./operations"
import { addSavedGroup, getTabGroupsConfig } from "./storage"
import { TAB_GROUPS_FEATURE_ID } from "./types"

// Save the focused window's tabs as a named group (OneTab / Session Buddy
// style). A form group: name input + submit.
const saveTabsAsGroup: CommandNode = {
  type: "group",
  id: "tab-groups-save",
  name: "Save Tabs as Group",
  description: "Save this window's tabs as a named group",
  icon: { type: "lucide", name: "Save" },
  color: "blue",
  keywords: ["tab", "group", "save", "session", "collection", "window"],
  // Form fields must not leak into root search.
  enableDeepSearch: false,
  children: async () => [
    {
      type: "input",
      id: "tab-groups-save-name",
      name: "Group Name",
      field: {
        id: "name",
        label: "Group Name",
        type: "text",
        placeholder: "e.g. Research, Work, Reading",
        required: true,
        validation: { type: "string", minLength: 1 },
      },
    },
    {
      type: "submit",
      id: "tab-groups-save-execute",
      name: "Save Group",
      actionLabel: "Save Group",
      execute: async (_context, values) => {
        const name = values?.name?.trim() || ""
        if (!name) {
          await sendErrorToastToActiveTab("Group needs a name")
          return
        }

        const { group, capturedTabIds } = await captureCurrentWindow(
          name,
          Date.now(),
        )
        if (group.tabs.length === 0) {
          await sendErrorToastToActiveTab("No tabs to save in this window")
          return
        }

        await addSavedGroup(group)

        const { closeTabsAfterSave } = await getTabGroupsConfig()
        if (closeTabsAfterSave) {
          await closeTabs(capturedTabIds)
        }

        await sendSuccessToastToActiveTab(
          `Saved "${name}" (${group.tabs.length} tabs)`,
        )
      },
    },
  ],
}

// Restore a saved group: a group listing each saved collection, each of which
// expands to "Open all tabs" plus one action per tab (mirrors openTabs.ts).
const restoreTabGroup: GroupCommandNode = {
  type: "group",
  id: "tab-groups-restore",
  name: "Restore Tab Group",
  description: "Reopen a saved group of tabs",
  icon: { type: "lucide", name: "FolderOpen" },
  color: "blue",
  keywords: ["tab", "group", "restore", "reopen", "session", "collection"],
  children: async () => {
    const { savedGroups, openRestoredInNewWindow } = await getTabGroupsConfig()
    if (savedGroups.length === 0) {
      return [
        createNoOpCommand(
          "tab-groups-restore-empty",
          "No saved groups",
          "Use “Save Tabs as Group” to create one",
        ),
      ]
    }

    return savedGroups.map((group): CommandNode => {
      const groupNode: GroupCommandNode = {
        type: "group",
        id: `tab-groups-restore-${group.id}`,
        name: group.name,
        description: `${group.tabs.length} tabs`,
        icon: { type: "lucide", name: "Folder" },
        children: async () => {
          const openAll: CommandNode = {
            type: "action",
            id: `tab-groups-restore-${group.id}-all`,
            name: `Open all ${group.tabs.length} tabs`,
            icon: { type: "lucide", name: "FolderOpen" },
            execute: async () => {
              await restoreGroup(group, openRestoredInNewWindow)
            },
          }
          const tabNodes = group.tabs.map(
            (tab): CommandNode => ({
              type: "action",
              id: `tab-groups-restore-${group.id}-${tab.id}`,
              name: tab.title || tab.url,
              description: tab.url,
              icon: { type: "lucide", name: "FileText" },
              execute: async () => {
                await createTab({ url: tab.url, pinned: Boolean(tab.pinned) })
              },
            }),
          )
          return [openAll, ...tabNodes]
        },
      }
      return groupNode
    })
  },
}

export const tabGroupsSavedCommands = (): CommandNode[] => [
  saveTabsAsGroup,
  restoreTabGroup,
  createConfigureFeatureCommand(TAB_GROUPS_FEATURE_ID, "Tab Groups"),
]
