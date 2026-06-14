// Architecture: background feature layer (Tab Groups). Read + mutate the saved
// collections held in the durable feature-config store. Every write goes back
// through the feature-config writer (replace-whole, serialized by
// withStorageLock) and is re-validated against tabGroupsConfigSchema first, so
// a malformed mutation never lands. See docs/features.md.
import { getFeatureConfig, setFeatureConfig } from "../config"
import {
  type SavedGroup,
  type SavedTab,
  TAB_GROUPS_FEATURE_ID,
  type TabGroupsConfig,
  tabGroupsConfigDefaults,
  tabGroupsConfigSchema,
} from "./types"

export const getTabGroupsConfig = async (): Promise<TabGroupsConfig> =>
  getFeatureConfig(TAB_GROUPS_FEATURE_ID, tabGroupsConfigDefaults)

const writeTabGroupsConfig = async (config: TabGroupsConfig): Promise<void> => {
  const parsed = tabGroupsConfigSchema.safeParse(config)
  if (!parsed.success) {
    throw new Error(`Invalid tab-groups config: ${parsed.error.message}`)
  }
  await setFeatureConfig(TAB_GROUPS_FEATURE_ID, parsed.data)
}

export const getSavedGroup = async (
  id: string,
): Promise<SavedGroup | undefined> => {
  const { savedGroups } = await getTabGroupsConfig()
  return savedGroups.find((group) => group.id === id)
}

export const addSavedGroup = async (group: SavedGroup): Promise<void> => {
  const config = await getTabGroupsConfig()
  await writeTabGroupsConfig({
    ...config,
    savedGroups: [group, ...config.savedGroups],
  })
}

export const renameSavedGroup = async (
  id: string,
  name: string,
  now: number,
): Promise<void> => {
  const config = await getTabGroupsConfig()
  await writeTabGroupsConfig({
    ...config,
    savedGroups: config.savedGroups.map((group) =>
      group.id === id ? { ...group, name, updatedAt: now } : group,
    ),
  })
}

export const deleteSavedGroup = async (id: string): Promise<void> => {
  const config = await getTabGroupsConfig()
  await writeTabGroupsConfig({
    ...config,
    savedGroups: config.savedGroups.filter((group) => group.id !== id),
  })
}

// Flip the `pinned` flag on one tab within a group (per-tab settings).
export const toggleSavedTabPin = async (
  groupId: string,
  tabId: string,
  now: number,
): Promise<void> => {
  const config = await getTabGroupsConfig()
  await writeTabGroupsConfig({
    ...config,
    savedGroups: config.savedGroups.map((group) => {
      if (group.id !== groupId) {
        return group
      }
      const tabs: SavedTab[] = group.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab,
      )
      return { ...group, tabs, updatedAt: now }
    }),
  })
}
