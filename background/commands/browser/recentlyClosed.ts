import type { CommandNode } from "../../../types/"
import {
  getActiveTab,
  getRecentlyClosed,
  restoreSession,
  sendTabMessage,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import { getFaviconUrl } from "../../utils/favicon"

// Format time for display
function formatClosedTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return "Just now"
}

export const recentlyClosed: CommandNode = {
  type: "group",
  id: "recently-closed",
  name: "Recently Closed",
  description: "Browse and restore recently closed tabs and windows",
  icon: { type: "lucide", name: "History" },
  color: "blue",
  permissions: ["sessions"],
  keywords: [
    "recently",
    "closed",
    "restore",
    "reopen",
    "tabs",
    "windows",
    "sessions",
  ],
  enableDeepSearch: true,
  children: async () => {
    try {
      const sessions = await getRecentlyClosed()

      if (!sessions || sessions.length === 0) {
        return [
          createNoOpCommand(
            "no-recently-closed",
            "No Recently Closed Items",
            "No recently closed tabs or windows available",
            { type: "lucide", name: "Clock" },
          ),
        ]
      }

      const commands: CommandNode[] = []

      sessions.forEach((session) => {
        if (session.tab) {
          // Handle closed tab
          const tab = session.tab
          const faviconUrl = getFaviconUrl(tab.url || "")
          const timeAgo = formatClosedTime(session.lastModified)

          commands.push({
            type: "action",
            id: `restore-tab-${tab.sessionId}`,
            name: tab.title || tab.url || "Untitled Tab",
            description: `${tab.url} • Closed ${timeAgo}`,
            icon: faviconUrl
              ? { type: "url", url: faviconUrl }
              : { type: "lucide", name: "Globe" },
            color: "blue",
            keywords: [
              (tab.title || "").toLowerCase(),
              (tab.url || "").toLowerCase(),
              "tab",
              "closed",
              "restore",
            ],
            actionLabel: "Restore Tab",
            allowCustomKeybinding: false, // Dynamic session commands shouldn't have custom keybindings
            execute: async () => {
              const activeTab = await getActiveTab()

              try {
                await restoreSession(tab.sessionId)

                if (activeTab) {
                  await sendTabMessage(activeTab.id, {
                    type: "monocle-alert",
                    level: "success",
                    message: `Restored tab: ${tab.title || "Tab"}`,
                    icon: { name: "RotateCcw" },
                  })
                }
              } catch (error) {
                console.error("Failed to restore tab:", error)

                if (activeTab) {
                  await sendTabMessage(activeTab.id, {
                    type: "monocle-alert",
                    level: "error",
                    message: `Failed to restore tab: ${tab.title || "Tab"}`,
                    icon: { name: "AlertTriangle" },
                  })
                }
              }
            },
          })
        } else if (session.window) {
          // Handle closed window
          const window = session.window
          const tabCount = window.tabs?.length || 0
          const timeAgo = formatClosedTime(session.lastModified)

          // Use the first tab's title/url as the window identifier
          const firstTab = window.tabs?.[0]
          const windowName =
            firstTab?.title || firstTab?.url || `Window (${tabCount} tabs)`

          commands.push({
            type: "action",
            id: `restore-window-${window.sessionId}`,
            name: windowName,
            description: `Window with ${tabCount} tabs • Closed ${timeAgo}`,
            icon: { type: "lucide", name: "Monitor" },
            color: "purple",
            keywords: [
              windowName.toLowerCase(),
              "window",
              "closed",
              "restore",
              `${tabCount} tabs`,
            ],
            actionLabel: "Restore Window",
            allowCustomKeybinding: false, // Dynamic session commands shouldn't have custom keybindings
            execute: async () => {
              const activeTab = await getActiveTab()

              try {
                await restoreSession(window.sessionId)

                if (activeTab) {
                  await sendTabMessage(activeTab.id, {
                    type: "monocle-alert",
                    level: "success",
                    message: `Restored window with ${tabCount} tabs`,
                    icon: { name: "Monitor" },
                  })
                }
              } catch (error) {
                console.error("Failed to restore window:", error)

                if (activeTab) {
                  await sendTabMessage(activeTab.id, {
                    type: "monocle-alert",
                    level: "error",
                    message: "Failed to restore window",
                    icon: { name: "AlertTriangle" },
                  })
                }
              }
            },
          })
        }
      })

      return commands.sort((a, b) => {
        // Sort by session timestamp (most recent first)
        // For now, just sort alphabetically by name since we don't have access to timestamp here
        const aName = typeof a.name === "string" ? a.name : ""
        const bName = typeof b.name === "string" ? b.name : ""
        return aName.localeCompare(bName)
      })
    } catch (error) {
      console.error("Failed to load recently closed sessions:", error)
      return [
        createNoOpCommand(
          "sessions-error",
          "Error Loading Sessions",
          "Failed to fetch recently closed items. Sessions API may not be available.",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}
