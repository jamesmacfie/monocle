// Architecture: background feature layer (Tab Groups). The live-browser side of
// saved collections: capture the focused window's tabs into a SavedGroup, and
// restore a SavedGroup back into real tabs. Pure browser-API orchestration
// (no storage); storage.ts owns persistence. Privileged tab/window calls stay
// here in the background. See docs/features.md.
import {
  createTab,
  createWindow,
  queryTabs,
  removeTab,
  updateTab,
} from "../../utils/browser"
import type { SavedGroup, SavedTab } from "./types"

// Build a SavedGroup from the currently focused window's tabs, recording each
// tab's pinned state. Returns the group plus the live tab ids (so the caller
// can optionally close them after saving).
export const captureCurrentWindow = async (
  name: string,
  now: number,
): Promise<{ group: SavedGroup; capturedTabIds: number[] }> => {
  const tabs = await queryTabs({ currentWindow: true })
  const capturedTabIds: number[] = []
  const savedTabs: SavedTab[] = []

  for (const tab of tabs) {
    if (!tab?.url) {
      continue
    }
    if (typeof tab.id === "number") {
      capturedTabIds.push(tab.id)
    }
    savedTabs.push({
      id: crypto.randomUUID(),
      url: tab.url,
      title: tab.title || undefined,
      pinned: Boolean(tab.pinned) || undefined,
    })
  }

  const group: SavedGroup = {
    id: crypto.randomUUID(),
    name,
    tabs: savedTabs,
    createdAt: now,
    updatedAt: now,
  }
  return { group, capturedTabIds }
}

// Open a saved group's tabs. In a new window the first tab seeds the window and
// the rest are appended; otherwise tabs open in the current window. Per-tab
// pinned state is reapplied in both modes. Individual failures (e.g. a
// chrome:// url) are swallowed so one bad tab can't abort the restore.
export const restoreGroup = async (
  group: SavedGroup,
  openInNewWindow: boolean,
): Promise<void> => {
  if (group.tabs.length === 0) {
    return
  }

  if (openInNewWindow) {
    const [first, ...rest] = group.tabs
    const window = await createWindow({ url: first.url })
    const firstTabId = window?.tabs?.[0]?.id
    if (first.pinned && typeof firstTabId === "number") {
      try {
        await updateTab(firstTabId, { pinned: true })
      } catch {
        // Best effort.
      }
    }
    for (const tab of rest) {
      try {
        await createTab({
          windowId: window?.id,
          url: tab.url,
          pinned: Boolean(tab.pinned),
          active: false,
        })
      } catch {
        // Best effort per tab.
      }
    }
    return
  }

  for (const tab of group.tabs) {
    try {
      await createTab({
        url: tab.url,
        pinned: Boolean(tab.pinned),
        active: false,
      })
    } catch {
      // Best effort per tab.
    }
  }
}

// Close the given live tabs (used by the save-and-close option). Best effort.
export const closeTabs = async (tabIds: number[]): Promise<void> => {
  for (const id of tabIds) {
    try {
      await removeTab(id)
    } catch {
      // Tab may already be gone.
    }
  }
}
