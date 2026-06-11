import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { addToFavoriteCommandIds } from "./favorites"
import { clearAllSettings, updateCommandSettings } from "./settings"
import { getSettingsCatalog } from "./settingsCatalog"
import { recordCommandUsage } from "./usage"

const bookmarkTree = [
  {
    id: "root",
    title: "Bookmarks",
    type: "folder",
    children: [
      {
        id: "b1",
        title: "Example Bookmark",
        type: "bookmark",
        url: "https://example.com/bookmarked",
      },
    ],
  },
]

const tabs = [
  {
    id: 1,
    title: "Example",
    url: "https://example.com/page",
    windowId: 10,
    active: true,
    currentWindow: true,
    index: 0,
  },
]

const installChromeStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
    tabs: {
      query: vi.fn((_queryInfo: object, callback?: Function) => {
        callback?.(tabs)
        return Promise.resolve(tabs)
      }),
    },
    bookmarks: {
      getTree: vi.fn((callback?: Function) => {
        callback?.(bookmarkTree)
        return Promise.resolve(bookmarkTree)
      }),
    },
    sessions: {
      getRecentlyClosed: vi.fn((_filter: object, callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
      }),
    },
    downloads: {
      search: vi.fn((_query: object, callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
      }),
    },
    history: {
      search: vi.fn((_query: object, callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
      }),
    },
  })
}

describe("settings catalog", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installChromeStubs()
    await clearAllSettings()
    await fakeBrowser.storage.local.remove([
      "monocle-favoriteCommandIds",
      "monocle-commandUsage",
    ])
  })

  it("returns durable root, new-tab, website, and opted-in nested commands", async () => {
    const catalog = await getSettingsCatalog({ platform: "chrome" })
    const ids = catalog.commands.map((command) => command.id)

    expect(ids).toContain("open-new-tab")
    expect(ids).toContain("github-actions")
    expect(ids).toContain("new-tab-clock")
    expect(ids).toContain("toggle-clock-visibility")
    expect(ids).toContain("calculator-execute")
    expect(ids).toContain("open-browser-page-settings")
  })

  it("keeps volatile dynamic rows out of the editable catalog", async () => {
    const catalog = await getSettingsCatalog({ platform: "chrome" })
    const ids = catalog.commands.map((command) => command.id)

    expect(ids).toContain("open-tabs")
    expect(ids).toContain("bookmarks")
    expect(ids).not.toContain("open-tab-1")
    expect(ids).not.toContain("bookmark-b1")
  })

  it("includes Firefox-only durable commands when building the Firefox catalog", async () => {
    const catalog = await getSettingsCatalog({ platform: "firefox" })

    expect(catalog.commands.map((command) => command.id)).toContain(
      "toggle-reader-mode",
    )
  })

  it("resolves persisted settings, favorite state, usage stats, and capabilities", async () => {
    await updateCommandSettings("open-new-tab", {
      hidden: true,
      keybinding: "<cmd-shift-t>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
    await addToFavoriteCommandIds("open-new-tab")
    await recordCommandUsage("open-new-tab")

    const catalog = await getSettingsCatalog({ platform: "chrome" })
    const command = catalog.commands.find((row) => row.id === "open-new-tab")

    expect(command).toMatchObject({
      id: "open-new-tab",
      name: "Open new tab",
      categoryId: "browser",
      settings: {
        hidden: true,
        keybinding: "<cmd-shift-t>",
        urlRules: {
          denyUrls: ["*://blocked.example.com/*"],
        },
      },
      isFavorite: true,
      defaultKeybinding: "<cmd-t>",
      effectiveKeybinding: "<cmd-shift-t>",
      capabilities: {
        canHide: true,
        canFavorite: true,
        canSetKeybinding: true,
        canEditUrlRules: true,
        hasUrlRules: true,
      },
    })
    expect(command?.usage.totalUsage).toBe(1)
  })
})
