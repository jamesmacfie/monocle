import type { ActionCommandNode, CommandIcon } from "../../../shared/types"
import {
  callBrowserAPI,
  getActiveTab,
  getTab,
  queryTabs,
  sendErrorToastToActiveTab,
  updateTab,
  updateWindow,
} from "../../utils/browser"
import { getPreviousActivatedTabId } from "./tabActivationHistory"

type TabNavigationCommandConfig = {
  id: string
  name: string
  description: string
  icon: CommandIcon
  keywords: string[]
  execute: () => Promise<void>
}

const createTabNavigationCommand = ({
  id,
  name,
  description,
  icon,
  keywords,
  execute,
}: TabNavigationCommandConfig): ActionCommandNode => ({
  type: "action",
  id,
  name,
  description,
  icon,
  color: "green",
  keywords,
  permissions: ["tabs"],
  execute,
})

const focusTab = async (tabId: number): Promise<void> => {
  await updateTab(tabId, { active: true })
  const tab = await getTab(tabId)
  if (tab?.windowId) {
    await updateWindow(tab.windowId, { focused: true })
  }
}

const getCurrentWindowTabs = async () => {
  return (await queryTabs({ currentWindow: true })).sort(
    (left, right) => (left.index ?? 0) - (right.index ?? 0),
  )
}

const focusRelativeTab = async (offset: number): Promise<void> => {
  const tabs = await getCurrentWindowTabs()
  const activeIndex = tabs.findIndex((tab) => tab.active)
  if (activeIndex < 0 || tabs.length === 0) {
    return
  }

  const nextIndex = (activeIndex + offset + tabs.length) % tabs.length
  const targetTab = tabs[nextIndex]
  if (targetTab?.id) {
    await focusTab(targetTab.id)
  }
}

export const focusNextTab = createTabNavigationCommand({
  id: "focus-next-tab",
  name: "Go to next tab",
  description: "Focus the next tab in the current window",
  icon: { type: "lucide", name: "ChevronRight" },
  keywords: ["tab", "next", "right", "vim"],
  execute: async () => focusRelativeTab(1),
})

export const focusPreviousTab = createTabNavigationCommand({
  id: "focus-previous-tab",
  name: "Go to previous tab",
  description: "Focus the previous tab in the current window",
  icon: { type: "lucide", name: "ChevronLeft" },
  keywords: ["tab", "previous", "left", "vim"],
  execute: async () => focusRelativeTab(-1),
})

export const focusFirstTab = createTabNavigationCommand({
  id: "focus-first-tab",
  name: "Go to first tab",
  description: "Focus the first tab in the current window",
  icon: { type: "lucide", name: "ArrowLeft" },
  keywords: ["tab", "first", "vim"],
  execute: async () => {
    const targetTab = (await getCurrentWindowTabs())[0]
    if (targetTab?.id) {
      await focusTab(targetTab.id)
    }
  },
})

export const focusLastTab = createTabNavigationCommand({
  id: "focus-last-tab",
  name: "Go to last tab",
  description: "Focus the last tab in the current window",
  icon: { type: "lucide", name: "ArrowRight" },
  keywords: ["tab", "last", "vim"],
  execute: async () => {
    const tabs = await getCurrentWindowTabs()
    const targetTab = tabs[tabs.length - 1]
    if (targetTab?.id) {
      await focusTab(targetTab.id)
    }
  },
})

export const focusLastActiveTab = createTabNavigationCommand({
  id: "focus-last-active-tab",
  name: "Go to last active tab",
  description: "Focus the previously active tab",
  icon: { type: "lucide", name: "History" },
  keywords: ["tab", "last", "active", "previous", "vim"],
  execute: async () => {
    const activeTab = await getActiveTab()
    const previousTabId = await getPreviousActivatedTabId(activeTab?.id)
    if (previousTabId) {
      await focusTab(previousTabId)
    }
  },
})

export const focusAudibleTab = createTabNavigationCommand({
  id: "focus-audible-tab",
  name: "Go to audible tab",
  description: "Focus the next audible tab in the current window",
  icon: { type: "lucide", name: "Volume2" },
  keywords: ["tab", "audio", "audible", "sound", "vim"],
  execute: async () => {
    const tabs = await getCurrentWindowTabs()
    const activeIndex = tabs.findIndex((tab) => tab.active)
    const orderedTabs =
      activeIndex >= 0
        ? [...tabs.slice(activeIndex + 1), ...tabs.slice(0, activeIndex + 1)]
        : tabs
    const targetTab = orderedTabs.find(
      (tab) => tab.audible && !tab.mutedInfo?.muted,
    )

    if (targetTab?.id) {
      await focusTab(targetTab.id)
      return
    }

    await sendErrorToastToActiveTab("No audible tab found")
  },
})

export const hardReloadCurrentTab = createTabNavigationCommand({
  id: "hard-reload-current-tab",
  name: "Hard reload current tab",
  description: "Reload the current tab and bypass the browser cache",
  icon: { type: "lucide", name: "RotateCcw" },
  keywords: ["reload", "hard", "refresh", "cache", "vim"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await callBrowserAPI("tabs", "reload", activeTab.id, {
        bypassCache: true,
      })
    }
  },
})

export const stopLoadingCurrentTab = createTabNavigationCommand({
  id: "stop-loading-current-tab",
  name: "Stop loading current tab",
  description: "Stop loading the current page",
  icon: { type: "lucide", name: "XOctagon" },
  keywords: ["stop", "loading", "load", "page", "vim"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    await callBrowserAPI("scripting", "executeScript", {
      target: { tabId: activeTab.id },
      func: () => window.stop(),
    })
  },
})

export const tabNavigationShortcutCommands = [
  focusNextTab,
  focusPreviousTab,
  focusFirstTab,
  focusLastTab,
  focusLastActiveTab,
  focusAudibleTab,
  hardReloadCurrentTab,
  stopLoadingCurrentTab,
]
