import type { CommandNode } from "../../../shared/types"
import {
  getActiveTab,
  queryTabs,
  removeTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"

export const closeDuplicateTabs: CommandNode = {
  type: "action",
  id: "close-duplicate-tabs",
  name: "Close duplicate tabs",
  icon: { type: "lucide", name: "Copy" },
  color: "red",
  permissions: ["tabs"],
  confirmAction: true,
  execute: async () => {
    // Look across every window — a duplicate is a duplicate regardless of
    // which window it lives in.
    const allTabs = await queryTabs({})
    const activeTab = await getActiveTab()
    const currentWindowId = activeTab?.windowId

    // Decide which tab in each URL group to keep. Prefer pinned tabs, then the
    // active tab, then tabs in the user's current window (so we don't favour a
    // background window just because its tab index is lower — index is
    // per-window). Sorting keepers to the front means the first time we see a
    // URL is always the tab we want to keep.
    const keeperScore = (tab: {
      pinned?: boolean
      active?: boolean
      windowId?: number
    }) =>
      (tab.pinned ? 4 : 0) +
      (tab.active ? 2 : 0) +
      (currentWindowId !== undefined && tab.windowId === currentWindowId
        ? 1
        : 0)

    const ordered = [...allTabs].sort((a, b) => {
      const diff = keeperScore(b) - keeperScore(a)
      if (diff !== 0) {
        return diff
      }
      return (a.index ?? 0) - (b.index ?? 0)
    })

    const seenUrls = new Set<string>()
    let closedCount = 0

    for (const tab of ordered) {
      if (!tab.url || tab.id === undefined) {
        continue
      }

      if (!seenUrls.has(tab.url)) {
        seenUrls.add(tab.url)
        continue
      }

      // Never close pinned tabs, even when they duplicate another tab.
      if (tab.pinned) {
        continue
      }

      await removeTab(tab.id)
      closedCount++
    }

    if (closedCount > 0) {
      await sendSuccessToastToActiveTab(
        `${closedCount} duplicate tab${closedCount === 1 ? "" : "s"} closed`,
      )
    }
  },
}
