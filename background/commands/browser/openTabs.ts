import { match } from "ts-pattern"
import type { Command, ParentCommand, RunCommand } from "../../../types/"
import {
  createTab,
  getTab,
  queryTabs,
  removeTab,
  updateTab,
  updateWindow,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import { getFaviconIcon } from "../../utils/favicon"

interface TabInfo {
  id: number
  title: string
  url: string
  favIconUrl?: string
  windowId: number
  pinned: boolean
  audible: boolean
  muted: boolean
  active: boolean
  index: number
}

interface WindowInfo {
  id: number
  focused: boolean
  type: string
  tabs: TabInfo[]
}

// Convert tab to command with various actions
function createTabCommand(tab: TabInfo, _windowTitle: string): RunCommand {
  const tabName = tab.title || "Untitled Tab"
  const tabUrl = tab.url || ""

  return {
    id: `open-tab-${tab.id}`,
    name: tabName,
    description: tabUrl,
    icon: async () => {
      return await getFaviconIcon({
        browserFaviconUrl: tab.favIconUrl,
        url: tab.url,
        fallback: {
          useTabStateIcons: true,
          pinned: tab.pinned,
          audible: tab.audible,
          muted: tab.muted,
        },
      })
    },
    color: async () => {
      return match({
        active: tab.active,
        pinned: tab.pinned,
        audible: tab.audible,
      })
        .with({ active: true }, () => "green")
        .with({ pinned: true }, () => "blue")
        .with({ audible: true }, () => "orange")
        .otherwise(() => "gray")
    },
    actionLabel: "Go to Tab",
    modifierActionLabel: {
      cmd: "Duplicate Tab",
      shift: "Close Tab",
      alt: "Pin/Unpin Tab",
    },
    run: async (context) => {
      try {
        await match(context?.modifierKey)
          .with("shift", async () => {
            // Close the tab
            await removeTab(tab.id)
          })
          .with("cmd", async () => {
            // Duplicate the tab
            await createTab({
              url: tab.url,
              active: true,
              windowId: tab.windowId,
            })
          })
          .with("alt", async () => {
            // Pin/unpin the tab
            await updateTab(tab.id, { pinned: !tab.pinned })
          })
          .otherwise(async () => {
            // Default: Switch to the tab
            await updateTab(tab.id, { active: true })

            // Bring the window to the front if the tab is in another window
            const updatedTab = await getTab(tab.id)
            if (updatedTab.windowId) {
              await updateWindow(updatedTab.windowId, { focused: true })
            }
          })
      } catch (error) {
        console.error(`Failed to perform action on tab ${tab.id}:`, error)
      }
    },
  }
}

// Create window folder command that groups tabs by window
function createWindowCommand(windowInfo: WindowInfo): ParentCommand {
  const windowTitle = windowInfo.focused ? "Current Window" : "Other Window"
  const tabCount = windowInfo.tabs.length

  return {
    id: `window-${windowInfo.id}`,
    name: `${windowTitle} (${tabCount} tab${tabCount !== 1 ? "s" : ""})`,
    description: `Browse ${tabCount} tabs in this window`,
    icon: {
      type: "lucide",
      name: windowInfo.focused ? "WindowMaximize" : "Window",
    },
    color: windowInfo.focused ? "green" : "blue",
    commands: async () => {
      return windowInfo.tabs
        .sort((a, b) => a.index - b.index) // Sort by tab order
        .map((tab) => createTabCommand(tab, windowTitle))
    },
  }
}

export const openTabs: ParentCommand = {
  id: "open-tabs",
  name: "Open Tabs",
  description: "Browse and manage all open tabs across all windows",
  icon: { type: "lucide", name: "Tabs" },
  color: "blue",
  keybinding: "⌘ t",
  enableDeepSearch: true, // Enable deep search for nested tab access
  commands: async () => {
    try {
      // Get all tabs from all windows
      const allTabs = await queryTabs({})

      if (!allTabs || allTabs.length === 0) {
        return [
          createNoOpCommand(
            "no-open-tabs",
            "No tabs found",
            "No open tabs available",
            { type: "lucide", name: "TabsX" },
          ),
        ]
      }

      // Get the current window ID by finding the active tab in current window
      const [activeTabInCurrentWindow] = await queryTabs({
        active: true,
        currentWindow: true,
      })
      const currentWindowId = activeTabInCurrentWindow?.windowId

      // Group tabs by window
      const windowMap: Map<number, WindowInfo> = new Map()

      for (const tab of allTabs) {
        if (!tab.id || !tab.windowId) continue

        if (!windowMap.has(tab.windowId)) {
          windowMap.set(tab.windowId, {
            id: tab.windowId,
            focused: tab.windowId === currentWindowId, // Check if this is the current window
            type: "normal", // Default type
            tabs: [],
          })
        }

        const windowInfo = windowMap.get(tab.windowId)!
        windowInfo.tabs.push({
          id: tab.id,
          title: tab.title || "Untitled Tab",
          url: tab.url || "",
          favIconUrl: tab.favIconUrl,
          windowId: tab.windowId,
          pinned: tab.pinned || false,
          audible: tab.audible || false,
          muted: tab.mutedInfo?.muted || false,
          active: tab.active || false,
          index: tab.index || 0,
        })
      }

      const commands: Command[] = []

      // If only one window, show tabs directly without window grouping
      if (windowMap.size === 1) {
        const windowInfo = Array.from(windowMap.values())[0]
        const windowTitle = "Current Window"

        return windowInfo.tabs
          .sort((a, b) => a.index - b.index)
          .map((tab) => createTabCommand(tab, windowTitle))
      }

      // Multiple windows - create window folders
      const windows = Array.from(windowMap.values())
      for (const windowInfo of windows) {
        commands.push(createWindowCommand(windowInfo))
      }

      return commands
    } catch (error) {
      console.error("Failed to load open tabs:", error)
      return [
        createNoOpCommand(
          "tabs-error",
          "Error Loading Tabs",
          "Failed to fetch open tabs",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}
