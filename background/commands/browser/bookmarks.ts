import type { Command, ParentCommand, RunCommand } from "../../../types/"
import {
  getActiveTab,
  getBookmarkTree,
  sendTabMessage,
  updateTab,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"

interface BookmarkNode {
  id: string
  title: string
  type?: "bookmark" | "folder" | "separator"
  url?: string
  children?: BookmarkNode[]
  dateAdded?: number
}

// Convert bookmark nodes to commands, handling both folders and bookmarks
function processBookmarkNode(
  node: BookmarkNode,
  parentPath: string[] = [],
): Command[] {
  const commands: Command[] = []

  // Skip separators
  if (node.type === "separator") {
    return commands
  }

  if (node.type === "folder" && node.children) {
    // This is a folder - create a ParentCommand
    const folderCommand: ParentCommand = {
      id: `bookmark-folder-${node.id}`,
      name: node.title || "Untitled Folder",
      description: `Browse ${node.title || "folder"} bookmarks`,
      icon: { type: "lucide", name: "Folder" },
      color: "amber",
      keywords: [node.title?.toLowerCase() || "folder"],
      commands: async () => {
        // Process children and return as commands
        const childCommands: Command[] = []

        for (const child of node.children || []) {
          const childPath = [...parentPath, node.title || "Untitled Folder"]
          childCommands.push(...processBookmarkNode(child, childPath))
        }

        return childCommands
      },
    }

    commands.push(folderCommand)
  } else if (node.url && node.title) {
    // This is a bookmark with a URL
    const bookmarkCommand: RunCommand = {
      id: `bookmark-${node.id}`,
      name: node.title,
      description: node.url,
      icon: async () => {
        // Try to get favicon from the URL
        try {
          const url = new URL(node.url!)
          const faviconUrl = `${url.protocol}//${url.host}/favicon.ico`
          return { type: "url", url: faviconUrl }
        } catch (_e) {
          return { type: "lucide", name: "Bookmark" }
        }
      },
      color: "blue",
      keywords: [node.title.toLowerCase(), node.url.toLowerCase()],
      actionLabel: "Open",
      modifierActionLabel: {
        cmd: "Open in New Tab",
      },
      run: async (context) => {
        const activeTab = await getActiveTab()

        if (activeTab && node.url) {
          try {
            if (context?.modifierKey === "cmd") {
              // Open bookmark in new tab when cmd is pressed
              await sendTabMessage(activeTab.id, {
                type: "monocle-newTab",
                url: node.url,
              })

              // Show success notification
              await sendTabMessage(activeTab.id, {
                type: "monocle-alert",
                level: "success",
                message: `Opening ${node.title} in new tab`,
                icon: { name: "ExternalLink" },
              })
            } else {
              // Default: Navigate current tab to bookmark URL
              await updateTab(activeTab.id, { url: node.url })

              // Show success notification
              await sendTabMessage(activeTab.id, {
                type: "monocle-alert",
                level: "success",
                message: `Opening ${node.title}`,
                icon: { name: "ExternalLink" },
              })
            }
          } catch (error) {
            console.error(`Failed to open bookmark: ${node.title}`, error)

            // Show error notification
            await sendTabMessage(activeTab.id, {
              type: "monocle-alert",
              level: "error",
              message: "Failed to open bookmark",
              icon: { name: "AlertTriangle" },
            })
          }
        }
      },
    }

    commands.push(bookmarkCommand)
  } else if (node.children) {
    // Handle nodes that have children but no explicit type (Chrome compatibility)
    for (const child of node.children) {
      const childPath = [...parentPath, node.title || "Untitled Folder"]
      commands.push(...processBookmarkNode(child, childPath))
    }
  }

  return commands
}

export const bookmarks: ParentCommand = {
  id: "bookmarks",
  name: "Bookmarks",
  description: "Browse and open your bookmarks",
  icon: { type: "lucide", name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmarks", "favorites", "saved", "links"],
  commands: async () => {
    try {
      const bookmarkTree = await getBookmarkTree()

      if (!bookmarkTree || bookmarkTree.length === 0) {
        return [
          createNoOpCommand(
            "no-bookmarks",
            "No bookmarks found",
            "No bookmarks available",
            { type: "lucide", name: "BookmarkX" },
          ),
        ]
      }

      // Process all bookmark nodes from the tree
      const allCommands: Command[] = []
      for (const rootNode of bookmarkTree) {
        if (rootNode.children) {
          for (const child of rootNode.children) {
            allCommands.push(...processBookmarkNode(child))
          }
        }
      }

      // Sort by name for better organization
      return allCommands.sort((a, b) => {
        const aName = typeof a.name === "string" ? a.name : ""
        const bName = typeof b.name === "string" ? b.name : ""
        return aName.localeCompare(bName)
      })
    } catch (error) {
      console.error("Failed to load bookmarks:", error)
      return [
        createNoOpCommand(
          "bookmarks-error",
          "Error Loading Bookmarks",
          "Failed to fetch bookmarks",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}
