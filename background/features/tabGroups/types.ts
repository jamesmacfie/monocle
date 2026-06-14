// Architecture: background feature layer (Tab Groups). Config types + Zod
// schema + defaults for the feature. Saved collections live in the durable
// feature-config store (monocle-feature-config) under this feature id, so the
// schema doubles as the message-boundary validator AND the storage-mutation
// guard (storage.ts re-validates before every write). See docs/features.md.
import { z } from "zod"

export const TAB_GROUPS_FEATURE_ID = "tab-groups"

// One saved tab inside a group. Carries per-tab settings (currently `pinned`)
// so a group restores in the same shape it was captured. `id` is a stable
// handle for per-tab row actions (pin toggle); url is not unique within a group.
export type SavedTab = {
  id: string
  url: string
  title?: string
  pinned?: boolean
}

export type SavedGroup = {
  id: string
  name: string
  color?: string
  tabs: SavedTab[]
  createdAt: number
  updatedAt: number
}

export type TabGroupsConfig = {
  savedGroups: SavedGroup[]
  // Restore opens the group's tabs in a new window instead of the current one.
  openRestoredInNewWindow: boolean
  // After saving a group from the palette, close the captured tabs (OneTab
  // style). Off by default.
  closeTabsAfterSave: boolean
}

const savedTabSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().optional(),
  pinned: z.boolean().optional(),
})

const savedGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  tabs: z.array(savedTabSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const tabGroupsConfigSchema = z.object({
  savedGroups: z.array(savedGroupSchema),
  openRestoredInNewWindow: z.boolean(),
  closeTabsAfterSave: z.boolean(),
})

export const tabGroupsConfigDefaults: TabGroupsConfig = {
  savedGroups: [],
  openRestoredInNewWindow: false,
  closeTabsAfterSave: false,
}
