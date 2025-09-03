import type { Command, ParentCommand, RunCommand } from "../../../types/"
import {
  getActiveTab,
  getHistoryItems,
  sendTabMessage,
  updateTab,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import { getFaviconUrl } from "../../utils/favicon"

type HistoryItem = chrome.history.HistoryItem

// Time period definitions
interface TimePeriod {
  id: string
  name: string
  icon: string
  description: string
  startTime: number
  endTime: number
}

// Get time periods for grouping history
function getTimePeriods(): TimePeriod[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  return [
    {
      id: "today",
      name: "Today",
      icon: "Calendar",
      description: "History from today",
      startTime: today.getTime(),
      endTime: now.getTime(),
    },
    {
      id: "yesterday",
      name: "Yesterday",
      icon: "Clock",
      description: "History from yesterday",
      startTime: yesterday.getTime(),
      endTime: today.getTime(),
    },
    {
      id: "last-week",
      name: "Last Week",
      icon: "CalendarDays",
      description: "History from the past week",
      startTime: lastWeek.getTime(),
      endTime: yesterday.getTime(),
    },
    {
      id: "last-month",
      name: "Last Month",
      icon: "CalendarRange",
      description: "History from the past month",
      startTime: lastMonth.getTime(),
      endTime: lastWeek.getTime(),
    },
    {
      id: "older",
      name: "Older",
      icon: "Archive",
      description: "History older than a month",
      startTime: 0,
      endTime: lastMonth.getTime(),
    },
  ]
}

// Format time for display
function formatVisitTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (date >= today) {
    // Today - show time
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } else {
    // Other days - show date
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
  }
}

// Create a history item command
function createHistoryItemCommand(item: HistoryItem): RunCommand {
  const faviconUrl = getFaviconUrl(item.url || "")
  const visitTime = formatVisitTime(item.lastVisitTime || 0)

  return {
    id: `history-${item.id}`,
    name: item.title || item.url || "Untitled",
    description: `${item.url} • ${visitTime}`,
    icon: faviconUrl
      ? { type: "url", url: faviconUrl }
      : { type: "lucide", name: "Globe" },
    color: "blue",
    keywords: [
      item.title?.toLowerCase() || "",
      item.url?.toLowerCase() || "",
      "history",
      "visit",
    ],
    actionLabel: "Open",
    modifierActionLabel: {
      cmd: "Open in New Tab",
    },
    run: async (context) => {
      const activeTab = await getActiveTab()

      if (activeTab && item.url) {
        try {
          if (context?.modifierKey === "cmd") {
            // Open in new tab when cmd is pressed
            await sendTabMessage(activeTab.id, {
              type: "monocle-newTab",
              url: item.url,
            })

            // Show success notification
            await sendTabMessage(activeTab.id, {
              type: "monocle-alert",
              level: "success",
              message: `Opening ${item.title || item.url} in new tab`,
              icon: { name: "ExternalLink" },
            })
          } else {
            // Default: Navigate current tab to URL
            await updateTab(activeTab.id, { url: item.url })

            // Show success notification
            await sendTabMessage(activeTab.id, {
              type: "monocle-alert",
              level: "success",
              message: `Opening ${item.title || item.url}`,
              icon: { name: "ExternalLink" },
            })
          }
        } catch (error) {
          console.error(`Failed to open history item: ${item.title}`, error)

          // Show error notification
          await sendTabMessage(activeTab.id, {
            type: "monocle-alert",
            level: "error",
            message: "Failed to open history item",
            icon: { name: "AlertTriangle" },
          })
        }
      }
    },
  }
}

// Create time period commands
function createTimePeriodCommands(): Command[] {
  const periods = getTimePeriods()

  return periods.map(
    (period): ParentCommand => ({
      id: `history-${period.id}`,
      name: period.name,
      description: period.description,
      icon: { type: "lucide", name: period.icon },
      color: "blue",
      keywords: [period.name.toLowerCase(), "history"],
      commands: async () => {
        try {
          // Fetch history items for this time period
          const historyItems = await getHistoryItems({
            text: "",
            startTime: period.startTime,
            endTime: period.endTime,
            maxResults: 100,
          })

          if (!historyItems || historyItems.length === 0) {
            return [
              createNoOpCommand(
                `no-history-${period.id}`,
                `No history found`,
                `No browsing history found for ${period.name.toLowerCase()}`,
                { type: "lucide", name: "History" },
              ),
            ]
          }

          // Sort history items by visit time (newest first) then convert to commands
          return historyItems
            .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
            .map((item: HistoryItem) =>
              createHistoryItemCommand({
                id: item.id || `${item.url}-${item.lastVisitTime}`,
                url: item.url,
                title: item.title,
                lastVisitTime: item.lastVisitTime,
                visitCount: item.visitCount,
                typedCount: item.typedCount,
              }),
            )
        } catch (error) {
          console.error(`Failed to load history for ${period.name}:`, error)
          return [
            createNoOpCommand(
              `history-error-${period.id}`,
              "Error Loading History",
              `Failed to fetch history for ${period.name.toLowerCase()}`,
              { type: "lucide", name: "AlertTriangle" },
            ),
          ]
        }
      },
    }),
  )
}

export const browsingHistory: ParentCommand = {
  id: "history",
  name: "History",
  description: "Browse your browsing history by time period",
  icon: { type: "lucide", name: "History" },
  color: "green",
  keywords: ["history", "browsing", "visited", "past", "sites"],
  commands: async () => {
    try {
      // Return time period commands
      const timePeriodCommands = createTimePeriodCommands()

      if (timePeriodCommands.length === 0) {
        return [
          createNoOpCommand(
            "no-history-periods",
            "No History Available",
            "No browsing history periods available",
            { type: "lucide", name: "History" },
          ),
        ]
      }

      return timePeriodCommands
    } catch (error) {
      console.error("Failed to load history:", error)
      return [
        createNoOpCommand(
          "history-error",
          "Error Loading History",
          "Failed to fetch browsing history. Make sure the extension has history permission.",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}
