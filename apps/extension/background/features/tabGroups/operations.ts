import { isFirefox } from "../../../shared/utils/browser"
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
      // Firefox-only container id (undefined on Chrome). mutedInfo is the
      // browser-API shape; store only when actually muted.
      cookieStoreId: tab.cookieStoreId || undefined,
      muted: tab.mutedInfo?.muted ? true : undefined,
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
// Container is a Firefox-only concept; Chrome's tabs/windows.create rejects an
// unknown cookieStoreId. Persisted on every browser but only reapplied here so a
// Firefox-saved group restores into its container while a Chrome restore (e.g.
// of an imported config) ignores it instead of failing every tab.
const containerProps = (tab: SavedTab): { cookieStoreId?: string } =>
  isFirefox && tab.cookieStoreId ? { cookieStoreId: tab.cookieStoreId } : {}

// Reapply state that create calls can't take directly: muted has no create-time
// option in either browser, and windows.create can't pin its seed tab. Best
// effort so a failure here never aborts the rest of the restore.
const applyPostCreateState = async (
  tabId: number | undefined,
  tab: SavedTab,
  pinSeedTab = false,
): Promise<void> => {
  if (typeof tabId !== "number") {
    return
  }
  const update: { pinned?: boolean; muted?: boolean } = {}
  if (pinSeedTab && tab.pinned) {
    update.pinned = true
  }
  if (tab.muted) {
    update.muted = true
  }
  if (Object.keys(update).length === 0) {
    return
  }
  try {
    await updateTab(tabId, update)
  } catch {
    // Best effort.
  }
}

export const restoreGroup = async (
  group: SavedGroup,
  openInNewWindow: boolean,
): Promise<void> => {
  if (group.tabs.length === 0) {
    return
  }

  if (openInNewWindow) {
    const [first, ...rest] = group.tabs
    const window = await createWindow({
      url: first.url,
      ...containerProps(first),
    })
    // windows.create can't pin or mute its seed tab, so reapply both after.
    await applyPostCreateState(window?.tabs?.[0]?.id, first, true)
    for (const tab of rest) {
      try {
        const created = await createTab({
          windowId: window?.id,
          url: tab.url,
          pinned: Boolean(tab.pinned),
          active: false,
          ...containerProps(tab),
        })
        await applyPostCreateState(created?.id, tab)
      } catch {
        // Best effort per tab.
      }
    }
    return
  }

  for (const tab of group.tabs) {
    try {
      const created = await createTab({
        url: tab.url,
        pinned: Boolean(tab.pinned),
        active: false,
        ...containerProps(tab),
      })
      await applyPostCreateState(created?.id, tab)
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
