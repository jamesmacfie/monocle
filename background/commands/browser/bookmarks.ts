import type { CommandNode } from "../../../shared/types/"
import { isValidUrl } from "../../../shared/utils"
import {
  createBookmark,
  focusOrGoToUrl,
  getActiveTab,
  getBookmarkTree,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
  sendTabMessage,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import { getFaviconUrl } from "../../utils/favicon"
import { normalizeUrlForDedupe } from "../../utils/urlFilter"

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
): CommandNode[] {
  const commands: CommandNode[] = []

  // Skip separators
  if (node.type === "separator") {
    return commands
  }

  if (node.type === "folder" && node.children) {
    // This is a folder - create a ParentCommand
    const folderCommand: CommandNode = {
      type: "group",
      id: `bookmark-folder-${node.id}`,
      name: node.title || "Untitled Folder",
      description: `Browse ${node.title || "folder"} bookmarks`,
      icon: { type: "lucide", name: "Folder" },
      color: "amber",
      keywords: [node.title?.toLowerCase() || "folder"],
      settingsCatalog: {
        configurable: false,
      },
      children: async () => {
        // Process children and return as commands
        const childCommands: CommandNode[] = []

        for (const child of node.children || []) {
          const childPath = [...parentPath, node.title || "Untitled Folder"]
          childCommands.push(...processBookmarkNode(child, childPath))
        }

        return childCommands
      },
    }

    commands.push(folderCommand)
  } else if (node.url && node.title && isValidUrl(node.url)) {
    // This is a bookmark with a valid HTTP/HTTPS URL
    const faviconUrl = getFaviconUrl(node.url)
    const bookmarkCommand: CommandNode = {
      type: "action",
      id: `bookmark-${node.id}`,
      name: node.title,
      description: node.url,
      dedupeKey: normalizeUrlForDedupe(node.url),
      icon: faviconUrl
        ? { type: "url", url: faviconUrl }
        : { type: "lucide", name: "Globe" },
      color: "blue",
      keywords: [node.url.toLowerCase()],
      settingsCatalog: {
        configurable: false,
      },
      actionLabel: "Open",
      modifierActionLabel: {
        cmd: "Open in New Tab",
      },
      execute: async (context) => {
        if (node.url) {
          try {
            if (context?.modifierKey === "cmd") {
              // Always open in new tab when cmd is pressed
              const activeTab = await getActiveTab()
              if (activeTab) {
                await sendTabMessage(activeTab.id, {
                  type: "monocle-newTab",
                  url: node.url,
                })

                // Show success notification
                await sendSuccessToastToActiveTab(
                  `Opening ${node.title} in new tab`,
                  {
                    icon: { name: "ExternalLink" },
                  },
                )
              }
            } else {
              // Smart navigation: switch to existing tab or navigate current tab
              await focusOrGoToUrl(node.url)

              // Show success notification
              await sendSuccessToastToActiveTab(`Navigating to ${node.title}`, {
                icon: { name: "ExternalLink" },
              })
            }
          } catch (error) {
            console.error(`Failed to open bookmark: ${node.title}`, error)

            // Show error notification
            await sendErrorToastToActiveTab("Failed to open bookmark", {
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

interface FolderOption {
  id: string
  path: string
}

// Walk the bookmark tree and collect every folder with its full " > "-joined path.
function collectFolders(
  nodes: BookmarkNode[],
  parentPath: string[],
  out: FolderOption[],
): void {
  for (const node of nodes) {
    const isFolder = !node.url && Array.isArray(node.children)
    if (!isFolder) continue

    // The absolute root has no title; descend into its named roots directly.
    if (!node.title && parentPath.length === 0) {
      collectFolders(node.children || [], parentPath, out)
      continue
    }

    const title = node.title || "Untitled Folder"
    const path = [...parentPath, title]
    out.push({ id: node.id, path: path.join(" > ") })
    collectFolders(node.children || [], path, out)
  }
}

// Build the folder dropdown options and pick a sensible default ("Other Bookmarks").
async function getFolderOptions(): Promise<{
  options: Array<{ value: string; label: string }>
  defaultId: string | undefined
}> {
  const tree = await getBookmarkTree()
  const folders: FolderOption[] = []
  collectFolders(tree, [], folders)

  const options = folders.map((folder) => ({
    value: folder.id,
    label: folder.path,
  }))

  // Default to "Other Bookmarks": Chrome unfiled root is "2", Firefox is "unfiled_____".
  const knownOtherIds = ["2", "unfiled_____"]
  const defaultId =
    folders.find((folder) => knownOtherIds.includes(folder.id))?.id ??
    folders.find((folder) => /^other bookmarks$/i.test(folder.path))?.id ??
    options[0]?.value

  return { options, defaultId }
}

export const addBookmark: CommandNode = {
  type: "group",
  id: "add-bookmark",
  name: "Add Bookmark",
  description: "Bookmark the current page",
  icon: { type: "lucide", name: "Star" },
  color: "green",
  keywords: ["add", "bookmark", "save", "favorite", "star"],
  permissions: ["bookmarks"],
  // The form's inputs and submit must never be flattened into root search —
  // only this group itself should appear, opening the form on selection.
  enableDeepSearch: false,
  children: async (context) => {
    try {
      const { options, defaultId } = await getFolderOptions()

      const folderInput: CommandNode =
        options.length > 0
          ? {
              type: "input",
              id: "add-bookmark-folder",
              name: "Folder",
              field: {
                id: "folder",
                label: "Folder",
                type: "select",
                options,
                defaultValue: defaultId,
              },
            }
          : createNoOpCommand(
              "add-bookmark-no-folders",
              "No folders found",
              "Bookmark will be saved to the default location",
              { type: "lucide", name: "Folder" },
            )

      return [
        {
          type: "input",
          id: "add-bookmark-title",
          name: "Title",
          field: {
            id: "title",
            label: "Title",
            type: "text",
            placeholder: "Bookmark title",
            defaultValue: context.title || "",
          },
        },
        {
          type: "input",
          id: "add-bookmark-url",
          name: "URL",
          field: {
            id: "url",
            label: "URL",
            type: "text",
            placeholder: "https://example.com",
            defaultValue: context.url || "",
          },
        },
        folderInput,
        {
          type: "submit",
          id: "add-bookmark-execute",
          name: "Add Bookmark",
          actionLabel: "Add Bookmark",
          async execute(_context, values) {
            try {
              const url = values?.url?.trim() || ""
              if (!isValidUrl(url)) {
                await sendErrorToastToActiveTab("A valid URL is required", {
                  icon: { name: "AlertTriangle" },
                })
                return
              }

              const title = values?.title?.trim() || url
              const parentId = values?.folder || undefined

              await createBookmark({ parentId, title, url })

              await sendSuccessToastToActiveTab(`Bookmarked "${title}"`, {
                icon: { name: "Bookmark" },
              })
            } catch (error) {
              console.error("Failed to add bookmark:", error)
              await sendErrorToastToActiveTab("Failed to add bookmark", {
                icon: { name: "AlertTriangle" },
              })
            }
          },
        },
      ]
    } catch (error) {
      console.error("Failed to load Add Bookmark form:", error)
      return [
        createNoOpCommand(
          "add-bookmark-error",
          "Error Loading Add Bookmark",
          "Failed to load bookmark folders",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}

export const bookmarks: CommandNode = {
  type: "group",
  id: "bookmarks",
  name: "Bookmarks",
  description: "Browse and open your bookmarks",
  icon: { type: "lucide", name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmarks", "favorites", "saved", "links"],
  permissions: ["bookmarks"],
  enableDeepSearch: true,
  children: async () => {
    try {
      const bookmarkTree = await getBookmarkTree()

      if (!bookmarkTree || bookmarkTree.length === 0) {
        return [
          addBookmark,
          createNoOpCommand(
            "no-bookmarks",
            "No bookmarks found",
            "No bookmarks available",
            { type: "lucide", name: "BookmarkX" },
          ),
        ]
      }

      // Process all bookmark nodes from the tree
      const allCommands: CommandNode[] = []
      for (const rootNode of bookmarkTree) {
        if (rootNode.children) {
          for (const child of rootNode.children) {
            allCommands.push(...processBookmarkNode(child))
          }
        }
      }

      // Sort by name for better organization
      allCommands.sort((a, b) => {
        const aName = typeof a.name === "string" ? a.name : ""
        const bName = typeof b.name === "string" ? b.name : ""
        return aName.localeCompare(bName)
      })

      // Keep "Add Bookmark" pinned to the top, exempt from the alpha sort.
      return [addBookmark, ...allCommands]
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
