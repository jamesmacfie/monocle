// Architecture: background utility. Thin Promise wrappers over Chrome's native
// tab-group APIs (chrome.tabs.group/ungroup + chrome.tabGroups.*), used by the
// Tab Groups feature's Chrome-only native commands
// (background/features/tabGroups/nativeCommands.ts). Mirrors browserTabs.ts:
// dynamic indexing means `any`, and every call routes through callBrowserAPI so
// Chrome's callback+lastError style is normalized to a rejecting Promise.
//
// Firefox has no chrome.tabGroups API, so callers must gate these behind
// `supportedBrowsers: ["chrome"]`; nothing here is reachable on Firefox.
import { callBrowserAPI } from "./browserApi"

// Add tabs to a group. With `groupId` they join an existing group; without it a
// new group is created (optionally in `windowId`). Returns the group id.
export async function groupTabs(options: {
  tabIds: number | number[]
  groupId?: number
  createProperties?: { windowId?: number }
}): Promise<number> {
  const { tabIds, groupId, createProperties } = options
  const arg: Record<string, unknown> = { tabIds }
  if (groupId != null) {
    arg.groupId = groupId
  }
  if (createProperties) {
    arg.createProperties = createProperties
  }
  return callBrowserAPI("tabs", "group", arg)
}

// Remove tabs from whatever group they are in.
export async function ungroupTabs(tabIds: number | number[]): Promise<void> {
  return callBrowserAPI("tabs", "ungroup", tabIds)
}

// List native tab groups (defaults to all groups across windows).
export async function queryTabGroups(queryInfo: any = {}): Promise<any[]> {
  return callBrowserAPI("tabGroups", "query", queryInfo)
}

export async function getTabGroup(groupId: number): Promise<any> {
  return callBrowserAPI("tabGroups", "get", groupId)
}

// Update a group's title / color / collapsed state.
export async function updateTabGroup(
  groupId: number,
  updateProperties: { title?: string; color?: string; collapsed?: boolean },
): Promise<any> {
  return callBrowserAPI("tabGroups", "update", groupId, updateProperties)
}
