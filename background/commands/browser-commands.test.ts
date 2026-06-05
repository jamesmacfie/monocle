import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type {
  Browser,
  BrowserPermission,
  CommandNode,
} from "../../shared/types"
import {
  getCommandIdForKeybinding,
  initializeKeybindingRegistry,
} from "../keybindings/registry"
import { getChildrenCommands } from "../messages/getChildrenCommands"
import { getBookmarkTree, getRecentDownloads } from "../utils/browser"
import { clearBrowserData } from "./browser/clearBrowserData"
import { closeCurrentTab } from "./browser/closeCurrentTab"
import { commandsToSuggestions, executeCommand } from "./index"
import { updateCommandSettings } from "./settings"

type TestTab = {
  id: number
  title: string
  url: string
  windowId: number
  active?: boolean
  currentWindow?: boolean
  index?: number
  pinned?: boolean
  audible?: boolean
  mutedInfo?: { muted: boolean }
  favIconUrl?: string
}

const normalContext: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

const allPermissions: BrowserPermission[] = [
  "activeTab",
  "bookmarks",
  "browsingData",
  "contextualIdentities",
  "cookies",
  "downloads",
  "history",
  "sessions",
  "storage",
  "tabs",
]

const defaultTabs: TestTab[] = [
  {
    id: 1,
    title: "Example",
    url: "https://example.com/page",
    windowId: 10,
    active: true,
    currentWindow: true,
    index: 0,
  },
  {
    id: 2,
    title: "Docs",
    url: "https://docs.example.com/",
    windowId: 10,
    active: false,
    currentWindow: true,
    index: 1,
  },
]

let tabs: TestTab[] = []
let permissionAccess: Record<BrowserPermission, boolean>
let bookmarkTree: any[] = []
let downloads: any[] = []
let historyItems: any[] = []
let sessions: any[] = []
let chromeApi: any

const grantAllPermissions = (): Record<BrowserPermission, boolean> =>
  Object.fromEntries(
    allPermissions.map((permission) => [permission, true]),
  ) as Record<BrowserPermission, boolean>

const filterTabs = (queryInfo: Record<string, unknown>): TestTab[] => {
  return tabs.filter((tab) => {
    if (queryInfo.active !== undefined && tab.active !== queryInfo.active) {
      return false
    }

    if (
      queryInfo.currentWindow !== undefined &&
      tab.currentWindow !== queryInfo.currentWindow
    ) {
      return false
    }

    return true
  })
}

const callbackResult = <T>(result: T) =>
  vi.fn((_queryOrCallback?: unknown, maybeCallback?: Function) => {
    const callback =
      typeof _queryOrCallback === "function" ? _queryOrCallback : maybeCallback
    callback?.(result)
    return Promise.resolve(result)
  })

const installChromeStubs = () => {
  chromeApi = {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    permissions: {
      contains: vi.fn(
        async ({ permissions }: { permissions?: BrowserPermission[] }) => {
          return (permissions ?? []).every(
            (permission) => permissionAccess[permission] === true,
          )
        },
      ),
    },
    tabs: {
      query: vi.fn(
        (queryInfo: Record<string, unknown>, callback?: Function) => {
          const result = filterTabs(queryInfo)
          callback?.(result)
          return Promise.resolve(result)
        },
      ),
      create: vi.fn((createProperties: unknown, callback?: Function) => {
        const createdTab = {
          id: tabs.length + 100,
          title: "New Tab",
          url: "chrome://newtab/",
          windowId: 10,
          active: true,
          currentWindow: true,
          index: tabs.length,
          ...(typeof createProperties === "object" && createProperties
            ? createProperties
            : {}),
        }
        tabs.push(createdTab as TestTab)
        callback?.(createdTab)
        return Promise.resolve(createdTab)
      }),
      update: vi.fn(
        (tabId: number, updateProperties: object, callback?: Function) => {
          const tab = tabs.find((candidate) => candidate.id === tabId)
          const updated = tab ? Object.assign(tab, updateProperties) : undefined
          callback?.(updated)
          return Promise.resolve(updated)
        },
      ),
      get: vi.fn((tabId: number, callback?: Function) => {
        const tab = tabs.find((candidate) => candidate.id === tabId)
        callback?.(tab)
        return Promise.resolve(tab)
      }),
      remove: vi.fn((tabId: number, callback?: Function) => {
        tabs = tabs.filter((tab) => tab.id !== tabId)
        callback?.()
        return Promise.resolve()
      }),
      sendMessage: vi.fn(
        (_tabId: number, _message: unknown, callback?: Function) => {
          callback?.({ success: true })
          return Promise.resolve({ success: true })
        },
      ),
      duplicate: vi.fn((tabId: number, callback?: Function) => {
        const tab = tabs.find((candidate) => candidate.id === tabId)
        const duplicated = tab
          ? {
              ...tab,
              id: tabs.length + 100,
              active: true,
              index: (tab.index ?? 0) + 1,
            }
          : undefined
        if (duplicated) {
          tabs.push(duplicated)
        }
        callback?.(duplicated)
        return Promise.resolve(duplicated)
      }),
      reload: vi.fn((callback?: Function) => {
        callback?.()
        return Promise.resolve()
      }),
      goBack: vi.fn((_tabId: number, callback?: Function) => {
        callback?.()
        return Promise.resolve()
      }),
      move: vi.fn(
        (
          tabId: number,
          moveProperties: { index: number },
          callback?: Function,
        ) => {
          const tab = tabs.find((candidate) => candidate.id === tabId)
          if (tab) {
            tab.index = moveProperties.index
          }
          callback?.(tab)
          return Promise.resolve(tab)
        },
      ),
    },
    windows: {
      create: vi.fn((createData: object, callback?: Function) => {
        const window = { id: 20, ...createData }
        callback?.(window)
        return Promise.resolve(window)
      }),
      getCurrent: vi.fn((callback?: Function) => {
        const window = { id: 10 }
        callback?.(window)
        return Promise.resolve(window)
      }),
      remove: vi.fn((_windowId: number, callback?: Function) => {
        callback?.()
        return Promise.resolve()
      }),
      update: vi.fn(
        (_windowId: number, _updateInfo: object, callback?: Function) => {
          callback?.({ id: _windowId })
          return Promise.resolve({ id: _windowId })
        },
      ),
    },
    bookmarks: {
      getTree: callbackResult(bookmarkTree),
      getChildren: callbackResult([]),
    },
    downloads: {
      search: vi.fn((_query: unknown, callback?: Function) => {
        callback?.(downloads)
        return Promise.resolve(downloads)
      }),
      show: vi.fn((_downloadId: number, callback?: Function) => {
        callback?.()
        return Promise.resolve()
      }),
    },
    history: {
      search: vi.fn((_query: unknown, callback?: Function) => {
        callback?.(historyItems)
        return Promise.resolve(historyItems)
      }),
    },
    sessions: {
      getRecentlyClosed: vi.fn((_query: unknown, callback?: Function) => {
        callback?.(sessions)
        return Promise.resolve(sessions)
      }),
      restore: vi.fn((sessionId?: string, callback?: Function) => {
        const restored = sessions.find(
          (session) =>
            session.tab?.sessionId === sessionId ||
            session.window?.sessionId === sessionId,
        )
        callback?.(restored)
        return Promise.resolve(restored)
      }),
    },
    browsingData: {
      remove: vi.fn(
        (
          _options: chrome.browsingData.RemovalOptions,
          _dataTypes: chrome.browsingData.DataTypeSet,
          callback?: Function,
        ) => {
          callback?.()
          return Promise.resolve()
        },
      ),
    },
  }

  ;(fakeBrowser as any).browsingData = {
    ...(fakeBrowser as any).browsingData,
    remove: chromeApi.browsingData.remove,
    removeLocalStorage: vi.fn((_options: unknown, callback?: Function) => {
      callback?.()
      return Promise.resolve()
    }),
  }

  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", chromeApi)
}

const getChildren = async (
  id: string,
  parentPath: string[] = [],
  searchValue?: string,
) => {
  return (await getChildrenCommands({
    type: "get-children-commands",
    id,
    parentPath,
    searchValue,
    context: normalContext,
  })) as any
}

beforeEach(() => {
  fakeBrowser.reset()
  vi.useRealTimers()

  tabs = defaultTabs.map((tab) => ({ ...tab }))
  permissionAccess = grantAllPermissions()
  bookmarkTree = [
    {
      id: "0",
      title: "",
      children: [
        {
          id: "101",
          type: "bookmark",
          title: "Example Bookmark",
          url: "https://example.com/bookmark",
        },
      ],
    },
  ]
  downloads = [
    {
      id: 55,
      filename: "/Users/james/Downloads/report.pdf",
      finalUrl: "https://example.com/report.pdf",
      mime: "application/pdf",
      startTime: "2026-06-05T01:00:00.000Z",
      totalBytes: 1024,
      state: "complete",
      bytesReceived: 1024,
      url: "https://example.com/report.pdf",
    },
  ]
  historyItems = [
    {
      id: "201",
      url: "https://example.com/history",
      title: "History Item",
      lastVisitTime: Date.now(),
    },
  ]
  sessions = [
    {
      lastModified: Date.now(),
      tab: {
        sessionId: "session-1",
        title: "Closed Tab",
        url: "https://example.com/closed",
      },
    },
  ]

  installChromeStubs()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("browser command permission pages", () => {
  it("shows a permission-required row before loading a protected dynamic group", async () => {
    permissionAccess.bookmarks = false

    const response = await getChildren("bookmarks")

    expect(response.openPage).toBe(true)
    expect(response.children).toEqual([
      expect.objectContaining({
        id: "missing-permissions-bookmarks",
        type: "display",
        name: "Permission Required",
        permissions: ["bookmarks"],
      }),
    ])
    expect(chromeApi.bookmarks.getTree).not.toHaveBeenCalled()
  })

  it("carries inherited permissions on generated bookmark, tab, history, download, and session rows", async () => {
    const bookmarkResponse = await getChildren("bookmarks")
    expect(bookmarkResponse.children).toContainEqual(
      expect.objectContaining({
        id: "bookmark-101",
        permissions: ["bookmarks"],
      }),
    )

    const tabResponse = await getChildren("open-tabs")
    expect(tabResponse.children).toContainEqual(
      expect.objectContaining({
        id: "open-tab-2",
        permissions: ["tabs"],
      }),
    )

    const historyResponse = await getChildren("history")
    expect(historyResponse.children).toContainEqual(
      expect.objectContaining({
        id: "history-today",
        permissions: ["history"],
      }),
    )

    const historyTodayResponse = await getChildren("history-today", ["history"])
    expect(historyTodayResponse.children).toContainEqual(
      expect.objectContaining({
        id: "history-201",
        permissions: ["history"],
      }),
    )

    const downloadsResponse = await getChildren("downloads")
    expect(downloadsResponse.children).toContainEqual(
      expect.objectContaining({
        id: "download-55",
        permissions: ["downloads"],
      }),
    )

    const sessionsResponse = await getChildren("recently-closed")
    expect(sessionsResponse.children).toContainEqual(
      expect.objectContaining({
        id: "restore-tab-session-1",
        permissions: ["sessions"],
      }),
    )
  })

  it("blocks generated child execution after the browser permission is revoked", async () => {
    const tabResponse = await getChildren("open-tabs")
    expect(tabResponse.children).toContainEqual(
      expect.objectContaining({ id: "open-tab-2" }),
    )

    chromeApi.tabs.query.mockClear()
    chromeApi.tabs.update.mockClear()
    permissionAccess.tabs = false

    await expect(
      executeCommand("open-tab-2", normalContext, {}, undefined, {
        pageId: "open-tabs",
        parentPath: ["open-tabs"],
      }),
    ).rejects.toThrow("Command not found")

    expect(chromeApi.tabs.query).not.toHaveBeenCalled()
    expect(chromeApi.tabs.update).not.toHaveBeenCalled()
  })
})

describe("browser API readers", () => {
  it("does not turn missing permissions into empty reader results", async () => {
    permissionAccess.bookmarks = false
    permissionAccess.downloads = false

    await expect(getBookmarkTree()).resolves.toEqual(bookmarkTree)
    await expect(getRecentDownloads(50)).resolves.toEqual(downloads)

    expect(chromeApi.bookmarks.getTree).toHaveBeenCalledOnce()
    expect(chromeApi.downloads.search).toHaveBeenCalledOnce()
  })
})

describe("high-risk browser commands", () => {
  it("does not register keybindings for commands that require confirmation", async () => {
    await updateCommandSettings("close-current-tab", {
      keybinding: "<cmd-shift-x>",
    })

    await initializeKeybindingRegistry()

    expect(getCommandIdForKeybinding("<cmd-w>")).toBeUndefined()
    expect(getCommandIdForKeybinding("<cmd-shift-x>")).toBeUndefined()
    expect(getCommandIdForKeybinding("<cmd-t>")).toBe("open-new-tab")
  })

  it("does not expose custom keybinding actions for confirmed commands", async () => {
    const [suggestion] = await commandsToSuggestions(
      [closeCurrentTab],
      normalContext,
    )

    expect(suggestion.keybinding).toBeUndefined()
    expect(suggestion.type).toBe("action")
    if (suggestion.type !== "action") {
      throw new Error("Expected close-current-tab to convert to an action")
    }
    expect(suggestion.actions?.map((action) => action.id)).not.toContain(
      "set-keybinding-close-current-tab",
    )
  })

  it("preserves explicit confirmation metadata on browser-data clearing commands", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"))

    const dataTypeCommands = await (
      clearBrowserData as Extract<CommandNode, { type: "group" }>
    ).children(normalContext)
    const cacheCommand = dataTypeCommands.find(
      (command) => command.id === "clear-cache",
    ) as Extract<CommandNode, { type: "group" }>
    const timeSpanCommands = await cacheCommand.children(normalContext)
    const lastFiveMinutes = timeSpanCommands.find(
      (command) => command.id === "clear-cache-5-mins",
    ) as Extract<CommandNode, { type: "action" }>

    expect(lastFiveMinutes.confirmAction).toBe(true)

    await lastFiveMinutes.execute(normalContext)

    expect(chromeApi.browsingData.remove).toHaveBeenCalledWith(
      { since: Date.now() - 5 * 60 * 1000 },
      { cache: true },
    )
  })
})
