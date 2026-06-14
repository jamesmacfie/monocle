// Architecture: background feature layer (Tab Groups). Chrome-only commands
// over the browser's native tab-strip groups (chrome.tabs.group/ungroup +
// chrome.tabGroups.*). Every node declares supportedBrowsers ["chrome"] and the
// "tabGroups" permission, so the loader filters them out on Firefox (which has
// no such API). Unlike saved collections, these have no persistence — the
// browser owns the state. See docs/features.md.
import type {
  Browser,
  BrowserPermission,
  CommandNode,
  GroupCommandNode,
} from "../../../shared/types"
import {
  getActiveTab,
  getTabGroup,
  groupTabs,
  queryTabGroups,
  queryTabs,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
  ungroupTabs,
  updateTabGroup,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"

// chrome.tabGroups.TAB_GROUP_ID_NONE — a tab not in any group reports this.
const TAB_GROUP_ID_NONE = -1

// chrome.tabGroups.Color values.
const NATIVE_GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const

const chromeOnly: {
  supportedBrowsers: Browser.Platform[]
  permissions: BrowserPermission[]
} = {
  supportedBrowsers: ["chrome"],
  permissions: ["tabGroups", "tabs"],
}

// The focused tab's native group id, or null when it is not in a group.
const getActiveGroupId = async (): Promise<number | null> => {
  const tab = await getActiveTab()
  const groupId = tab?.groupId
  return typeof groupId === "number" && groupId !== TAB_GROUP_ID_NONE
    ? groupId
    : null
}

// Add the focused tab to an existing native group, or start a new one.
const addCurrentTabToGroup: GroupCommandNode = {
  type: "group",
  id: "tab-groups-native-add",
  name: "Add Tab to Group",
  description: "Add the current tab to a tab group",
  icon: { type: "lucide", name: "Box" },
  color: "teal",
  keywords: ["tab", "group", "add", "native", "strip"],
  ...chromeOnly,
  children: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return [
        createNoOpCommand(
          "tab-groups-native-add-empty",
          "No active tab",
          "Focus a tab first",
        ),
      ]
    }
    const tabId = activeTab.id

    const newGroup: CommandNode = {
      type: "action",
      id: "tab-groups-native-add-new",
      name: "New group",
      icon: { type: "lucide", name: "Plus" },
      execute: async () => {
        await groupTabs({ tabIds: [tabId] })
        await sendSuccessToastToActiveTab("Added tab to a new group")
      },
    }

    const groups = await queryTabGroups({ windowId: activeTab.windowId })
    const groupNodes = groups.map(
      (group): CommandNode => ({
        type: "action",
        id: `tab-groups-native-add-${group.id}`,
        name: group.title || `Group ${group.id}`,
        description: group.color,
        icon: { type: "lucide", name: "Box" },
        execute: async () => {
          await groupTabs({ tabIds: [tabId], groupId: group.id })
          await sendSuccessToastToActiveTab(
            `Added tab to "${group.title || "group"}"`,
          )
        },
      }),
    )

    return [newGroup, ...groupNodes]
  },
}

// Group every tab in the focused window into one new native group.
const groupCurrentWindow: CommandNode = {
  type: "action",
  id: "tab-groups-native-group-window",
  name: "Group All Tabs in Window",
  description: "Put every tab in this window into one group",
  icon: { type: "lucide", name: "Box" },
  color: "teal",
  keywords: ["tab", "group", "window", "all", "native"],
  ...chromeOnly,
  execute: async () => {
    const tabs = await queryTabs({ currentWindow: true })
    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((id): id is number => typeof id === "number")
    if (tabIds.length === 0) {
      await sendErrorToastToActiveTab("No tabs to group")
      return
    }
    await groupTabs({ tabIds })
    await sendSuccessToastToActiveTab(`Grouped ${tabIds.length} tabs`)
  },
}

// Rename the focused tab's native group (form: name input + submit).
const renameCurrentGroup: GroupCommandNode = {
  type: "group",
  id: "tab-groups-native-rename",
  name: "Rename Current Group",
  description: "Rename the tab group of the current tab",
  icon: { type: "lucide", name: "Pencil" },
  color: "teal",
  keywords: ["tab", "group", "rename", "title", "native"],
  enableDeepSearch: false,
  ...chromeOnly,
  children: async () => {
    const groupId = await getActiveGroupId()
    if (groupId === null) {
      return [
        createNoOpCommand(
          "tab-groups-native-rename-empty",
          "Current tab is not in a group",
          "Add it to a group first",
        ),
      ]
    }
    return [
      {
        type: "input",
        id: "tab-groups-native-rename-name",
        name: "Group Name",
        field: {
          id: "name",
          label: "Group Name",
          type: "text",
          placeholder: "Group name",
          required: true,
          validation: { type: "string", minLength: 1 },
        },
      },
      {
        type: "submit",
        id: "tab-groups-native-rename-execute",
        name: "Rename Group",
        actionLabel: "Rename Group",
        execute: async (_context, values) => {
          const name = values?.name?.trim() || ""
          if (!name) {
            await sendErrorToastToActiveTab("Group needs a name")
            return
          }
          // Re-read the active group at execute time.
          const id = await getActiveGroupId()
          if (id === null) {
            await sendErrorToastToActiveTab("Current tab is not in a group")
            return
          }
          await updateTabGroup(id, { title: name })
          await sendSuccessToastToActiveTab(`Renamed group to "${name}"`)
        },
      },
    ]
  },
}

// Recolor the focused tab's native group.
const setCurrentGroupColor: GroupCommandNode = {
  type: "group",
  id: "tab-groups-native-color",
  name: "Set Group Color",
  description: "Change the color of the current tab's group",
  icon: { type: "lucide", name: "Palette" },
  color: "teal",
  keywords: ["tab", "group", "color", "colour", "native"],
  ...chromeOnly,
  children: async () => {
    const groupId = await getActiveGroupId()
    if (groupId === null) {
      return [
        createNoOpCommand(
          "tab-groups-native-color-empty",
          "Current tab is not in a group",
          "Add it to a group first",
        ),
      ]
    }
    return NATIVE_GROUP_COLORS.map(
      (color): CommandNode => ({
        type: "action",
        id: `tab-groups-native-color-${color}`,
        name: color.charAt(0).toUpperCase() + color.slice(1),
        icon: { type: "lucide", name: "Palette" },
        execute: async () => {
          const id = await getActiveGroupId()
          if (id === null) {
            await sendErrorToastToActiveTab("Current tab is not in a group")
            return
          }
          await updateTabGroup(id, { color })
        },
      }),
    )
  },
}

// Collapse or expand the focused tab's native group.
const toggleCollapseCurrentGroup: CommandNode = {
  type: "action",
  id: "tab-groups-native-collapse",
  name: "Collapse/Expand Current Group",
  description: "Toggle the current tab's group collapsed state",
  icon: { type: "lucide", name: "Maximize2" },
  color: "teal",
  keywords: ["tab", "group", "collapse", "expand", "native"],
  ...chromeOnly,
  execute: async () => {
    const groupId = await getActiveGroupId()
    if (groupId === null) {
      await sendErrorToastToActiveTab("Current tab is not in a group")
      return
    }
    const group = await getTabGroup(groupId)
    await updateTabGroup(groupId, { collapsed: !group?.collapsed })
  },
}

// Remove the focused tab from its native group.
const ungroupCurrentTab: CommandNode = {
  type: "action",
  id: "tab-groups-native-ungroup",
  name: "Ungroup Current Tab",
  description: "Remove the current tab from its group",
  icon: { type: "lucide", name: "Minus" },
  color: "teal",
  keywords: ["tab", "group", "ungroup", "remove", "native"],
  ...chromeOnly,
  execute: async () => {
    const tab = await getActiveTab()
    if (!tab?.id) {
      await sendErrorToastToActiveTab("No active tab")
      return
    }
    await ungroupTabs([tab.id])
    await sendSuccessToastToActiveTab("Ungrouped tab")
  },
}

export const tabGroupsNativeCommands = (): CommandNode[] => [
  addCurrentTabToGroup,
  groupCurrentWindow,
  renameCurrentGroup,
  setCurrentGroupColor,
  toggleCollapseCurrentGroup,
  ungroupCurrentTab,
]
