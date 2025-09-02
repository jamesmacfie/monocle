import type { ParentCommand, RunCommand } from "../../../types"
import {
  clearAllBrowserData,
  clearCache,
  clearCookies,
  clearDownloads,
  clearFormData,
  clearHistory,
  clearIndexedDB,
  clearLocalStorage,
  clearPasswords,
  clearPluginData,
  clearServiceWorkers,
} from "../../utils/browser"

export const clearBrowserData: ParentCommand = {
  id: "clear-browser-data",
  name: "Clear Browser Data",
  description: "Clear different types of browser data for various time periods",
  icon: { name: "Trash2", type: "lucide" },
  color: "red",
  keywords: [
    "clear",
    "delete",
    "remove",
    "browsing",
    "data",
    "history",
    "cookies",
    "cache",
  ],

  commands: async () => {
    const dataTypes = [
      {
        id: "all",
        name: "All Data",
        description: "Clear all browser data",
        icon: { name: "Trash", type: "lucide" as const },
        clearFunction: clearAllBrowserData,
      },
      {
        id: "cookies",
        name: "Cookies",
        description: "Clear site cookies and session data",
        icon: { name: "Cookie", type: "lucide" as const },
        clearFunction: clearCookies,
      },
      {
        id: "history",
        name: "History",
        description: "Clear browsing history",
        icon: { name: "History", type: "lucide" as const },
        clearFunction: clearHistory,
      },
      {
        id: "cache",
        name: "Cache",
        description: "Clear cached images and files",
        icon: { name: "HardDrive", type: "lucide" as const },
        clearFunction: clearCache,
      },
      {
        id: "downloads",
        name: "Downloads",
        description: "Clear download history",
        icon: { name: "Download", type: "lucide" as const },
        clearFunction: clearDownloads,
      },
      {
        id: "form-data",
        name: "Form Data",
        description: "Clear autofill form data",
        icon: { name: "FileText", type: "lucide" as const },
        clearFunction: clearFormData,
      },
      {
        id: "local-storage",
        name: "Local Storage",
        description: "Clear website local storage",
        icon: { name: "Database", type: "lucide" as const },
        clearFunction: clearLocalStorage,
      },
      {
        id: "indexed-db",
        name: "IndexedDB",
        description: "Clear website databases",
        icon: { name: "Database", type: "lucide" as const },
        clearFunction: clearIndexedDB,
      },
      {
        id: "service-workers",
        name: "Service Workers",
        description: "Clear registered service workers",
        icon: { name: "Settings", type: "lucide" as const },
        clearFunction: clearServiceWorkers,
      },
      {
        id: "passwords",
        name: "Passwords",
        description: "Clear saved passwords",
        icon: { name: "Lock", type: "lucide" as const },
        clearFunction: clearPasswords,
      },
      {
        id: "plugin-data",
        name: "Plugin Data",
        description: "Clear Flash/plugin data",
        icon: { name: "Puzzle", type: "lucide" as const },
        clearFunction: clearPluginData,
      },
    ]

    return dataTypes.map(
      (dataType): ParentCommand => ({
        id: `clear-${dataType.id}`,
        name: dataType.name,
        description: dataType.description,
        icon: dataType.icon,
        color: "red",
        keywords: ["clear", "delete", dataType.name.toLowerCase()],

        commands: async () => {
          const now = Date.now()

          const timeSpans = [
            {
              id: "5-mins",
              name: "Last 5 Minutes",
              description: `Clear ${dataType.name.toLowerCase()} from the last 5 minutes`,
              minutes: 5,
              icon: { name: "Clock1", type: "lucide" as const },
            },
            {
              id: "30-mins",
              name: "Last 30 Minutes",
              description: `Clear ${dataType.name.toLowerCase()} from the last 30 minutes`,
              minutes: 30,
              icon: { name: "Clock3", type: "lucide" as const },
            },
            {
              id: "60-mins",
              name: "Last Hour",
              description: `Clear ${dataType.name.toLowerCase()} from the last hour`,
              minutes: 60,
              icon: { name: "Clock6", type: "lucide" as const },
            },
            {
              id: "today",
              name: "Today",
              description: `Clear all ${dataType.name.toLowerCase()} from today`,
              minutes: null as null,
              icon: { name: "Calendar", type: "lucide" as const },
            },
            {
              id: "all-time",
              name: "All Time",
              description: `Clear all ${dataType.name.toLowerCase()} (everything)`,
              minutes: 0,
              icon: { name: "Infinity", type: "lucide" as const },
            },
          ]

          return timeSpans.map(
            (timeSpan): RunCommand => ({
              id: `clear-${dataType.id}-${timeSpan.id}`,
              name: timeSpan.name,
              description: timeSpan.description,
              icon: timeSpan.icon,
              color: "red",
              keywords: [
                "clear",
                dataType.name.toLowerCase(),
                timeSpan.name.toLowerCase(),
              ],

              run: async () => {
                try {
                  let startTime: number

                  if (timeSpan.minutes === 0) {
                    startTime = 0
                  } else if (timeSpan.minutes === null) {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    startTime = today.getTime()
                  } else {
                    startTime = now - timeSpan.minutes * 60 * 1000
                  }

                  await dataType.clearFunction(startTime)
                } catch (error) {
                  console.error(
                    `Failed to clear ${dataType.name.toLowerCase()}:`,
                    error,
                  )
                }
              },
            }),
          )
        },
      }),
    )
  },
}
