import type { CommandIcon, CommandNode } from "../../../shared/types"
import { createTab } from "../../utils/browser"

// A definition of a built-in browser settings/management page.
//
// This command is Chrome-only (see `supportedBrowsers` below): Chrome lets
// extensions open `chrome://` pages via `tabs.create`, but Firefox rejects
// `tabs.create` for every privileged `about:` page (about:preferences,
// about:config, about:addons, about:downloads, …) with an "illegal URL"
// error, and exposes no WebExtension API to open browser settings pages. There
// is therefore no working Firefox equivalent to offer.
interface InternalPage {
  id: string
  name: string
  description: string
  icon: CommandIcon
  keywords: string[]
  url: string
}

const INTERNAL_PAGES: InternalPage[] = [
  {
    id: "settings",
    name: "Settings",
    description: "Open the browser settings page",
    icon: { type: "lucide", name: "Settings" },
    keywords: ["settings", "preferences", "options", "config"],
    url: "chrome://settings",
  },
  {
    id: "extensions",
    name: "Extensions",
    description: "Manage installed extensions",
    icon: { type: "lucide", name: "Puzzle" },
    keywords: ["extensions", "addons", "add-ons", "plugins"],
    url: "chrome://extensions",
  },
  {
    id: "downloads",
    name: "Downloads",
    description: "View downloaded files",
    icon: { type: "lucide", name: "Download" },
    keywords: ["downloads", "files", "saved"],
    url: "chrome://downloads",
  },
  {
    id: "history",
    name: "History",
    description: "Browse your visited pages",
    icon: { type: "lucide", name: "History" },
    keywords: ["history", "visited", "recent", "browsing"],
    url: "chrome://history",
  },
  {
    id: "bookmarks-manager",
    name: "Bookmarks Manager",
    description: "Open the bookmarks manager",
    icon: { type: "lucide", name: "Bookmark" },
    keywords: ["bookmarks", "manager", "favorites", "saved"],
    url: "chrome://bookmarks",
  },
  {
    id: "flags",
    name: "Flags",
    description: "Open experimental browser configuration",
    icon: { type: "lucide", name: "Flag" },
    keywords: ["flags", "experiments", "config", "advanced"],
    url: "chrome://flags",
  },
  {
    id: "site-settings",
    name: "Site Settings",
    description: "Manage permissions and content settings for sites",
    icon: { type: "lucide", name: "Shield" },
    keywords: ["site", "settings", "permissions", "content", "privacy"],
    url: "chrome://settings/content",
  },
  {
    id: "clear-browsing-data",
    name: "Clear Browsing Data",
    description: "Open the clear browsing data dialog",
    icon: { type: "lucide", name: "Trash2" },
    keywords: ["clear", "browsing", "data", "history", "cookies", "cache"],
    url: "chrome://settings/clearBrowserData",
  },
  {
    id: "keyboard-shortcuts",
    name: "Keyboard Shortcuts",
    description: "Manage extension keyboard shortcuts",
    icon: { type: "lucide", name: "Keyboard" },
    keywords: ["keyboard", "shortcuts", "keys", "bindings"],
    url: "chrome://extensions/shortcuts",
  },
]

export const internalPages: CommandNode = {
  type: "group",
  id: "open-browser-page",
  name: "Browser Management",
  description: "Jump to a built-in browser settings or management page",
  icon: { type: "lucide", name: "Cog" },
  color: "blue",
  // Chrome-only: Firefox cannot open privileged about: pages from an extension.
  supportedBrowsers: ["chrome"],
  keywords: [
    "browser",
    "management",
    "internal",
    "page",
    "settings",
    "chrome",
    "navigate",
  ],
  settingsCatalog: {
    includeChildren: true,
  },
  enableDeepSearch: true,
  children: async () => {
    return INTERNAL_PAGES.map(
      (page): CommandNode => ({
        type: "action",
        id: `open-browser-page-${page.id}`,
        name: page.name,
        description: page.description,
        icon: page.icon,
        color: "blue",
        keywords: page.keywords,
        actionLabel: "Open",
        execute: async () => {
          await createTab({ url: page.url })
        },
      }),
    )
  },
}
