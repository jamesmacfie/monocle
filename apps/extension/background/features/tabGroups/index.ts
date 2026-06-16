// Architecture: background feature layer (Tab Groups). The FeatureModule: it
// contributes the cross-browser saved-collection commands plus the Chrome-only
// native-group commands, and a settings page that manages saved groups through
// the generic record-list field (per-row Restore/Rename/Delete + per-tab
// Pin/Unpin). Registered in background/features/index.ts. See docs/features.md.
import type { RecordListItem } from "../../../shared/types"
import type { FeatureModule } from "../types"
import { tabGroupsSavedCommands } from "./commands"
import { tabGroupsNativeCommands } from "./nativeCommands"
import { restoreGroup } from "./operations"
import {
  deleteSavedGroup,
  getSavedGroup,
  getTabGroupsConfig,
  renameSavedGroup,
  toggleSavedTabPin,
} from "./storage"
import {
  TAB_GROUPS_FEATURE_ID,
  type TabGroupsConfig,
  tabGroupsConfigDefaults,
  tabGroupsConfigSchema,
} from "./types"

// Project saved groups into record-list rows: each group is a row whose
// children are its tabs (so a row expands to per-tab Pin/Unpin).
const projectSavedGroups = (
  config: TabGroupsConfig,
): Record<string, RecordListItem[]> => ({
  savedGroups: config.savedGroups.map((group) => ({
    id: group.id,
    label: group.name,
    sublabel: `${group.tabs.length} tab${group.tabs.length === 1 ? "" : "s"}`,
    children: group.tabs.map((tab) => ({
      id: tab.id,
      label: tab.title || tab.url,
      sublabel: tab.pinned ? "Pinned" : undefined,
    })),
  })),
})

const asString = (value: unknown): string =>
  typeof value === "string" ? value : ""

export const tabGroupsFeature: FeatureModule<TabGroupsConfig> = {
  id: TAB_GROUPS_FEATURE_ID,
  name: "Tab Groups",
  description: "Save tabs as groups and manage native tab groups",
  icon: { type: "lucide", name: "Box" },
  commands: () => [...tabGroupsSavedCommands(), ...tabGroupsNativeCommands()],
  settings: {
    configSchema: tabGroupsConfigSchema,
    defaults: tabGroupsConfigDefaults,
    lists: (config) => projectSavedGroups(config),
    schema: {
      sections: [
        {
          title: "Saved groups",
          description:
            "Groups you save from the palette. Expand a group to pin individual tabs; pinned tabs restore pinned.",
          fields: [
            {
              id: "savedGroups",
              label: "Saved groups",
              type: "record-list",
              emptyText: "No saved groups yet. Use “Save Tabs as Group”.",
              itemActions: [
                { id: "restore-group", label: "Restore", style: "primary" },
                { id: "rename-group", label: "Rename", editLabel: true },
                { id: "delete-group", label: "Delete", style: "danger" },
              ],
              childActions: [{ id: "toggle-pin", label: "Pin/Unpin" }],
            },
          ],
        },
        {
          title: "Behavior",
          fields: [
            {
              id: "openRestoredInNewWindow",
              label: "Open restored groups in a new window",
              type: "switch",
            },
            {
              id: "closeTabsAfterSave",
              label: "Close tabs after saving a group",
              type: "switch",
            },
          ],
        },
      ],
    },
    handleAction: async (actionId, { payload }) => {
      const itemId = asString(payload?.itemId)
      switch (actionId) {
        case "restore-group": {
          if (!itemId) {
            return
          }
          const group = await getSavedGroup(itemId)
          if (!group) {
            return
          }
          const { openRestoredInNewWindow } = await getTabGroupsConfig()
          await restoreGroup(group, openRestoredInNewWindow)
          return
        }
        case "rename-group": {
          const name = asString(payload?.value).trim()
          if (!itemId || !name) {
            return
          }
          await renameSavedGroup(itemId, name, Date.now())
          return
        }
        case "delete-group": {
          if (!itemId) {
            return
          }
          await deleteSavedGroup(itemId)
          return
        }
        case "toggle-pin": {
          const childId = asString(payload?.childId)
          if (!itemId || !childId) {
            return
          }
          await toggleSavedTabPin(itemId, childId, Date.now())
          return
        }
        default:
          return
      }
    },
  },
}
