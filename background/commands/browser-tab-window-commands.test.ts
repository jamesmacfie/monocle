import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser, BrowserPermission } from "../../shared/types"
import { captureScreenshot } from "./browser/captureScreenshot"
import { closeCurrentTab } from "./browser/closeCurrentTab"
import { closeCurrentWindow } from "./browser/closeCurrentWindow"
import { closeDuplicateTabs } from "./browser/closeDuplicateTabs"
import { duplicateCurrentTab } from "./browser/duplicateCurrentTab"
import { goBackCommand } from "./browser/goBack"
import { goForwardCommand } from "./browser/goForward"
import { moveCurrentTabToANewWindow } from "./browser/moveCurrentTabToANewWindow"
import { moveCurrentTabToPopupWindow } from "./browser/moveCurrentTabToPopupWindow"
import { moveTabLeft } from "./browser/moveTabLeft"
import { moveTabRight } from "./browser/moveTabRight"
import { muteCurrentTab } from "./browser/muteCurrentTab"
import { openNewPrivateWindow } from "./browser/openNewPrivateWindow"
import { openNewTab } from "./browser/openNewTab"
import { openNewWindow } from "./browser/openNewWindow"
import { pinCurrentTab } from "./browser/pinCurrentTab"
import { reloadCurrentTab } from "./browser/reloadCurrentTab"
import { unmuteCurrentTab } from "./browser/unmuteCurrentTab"
import { executeCommand } from "./index"

type TestTab = {
  id: number
  title: string
  url: string
  windowId: number
  active?: boolean
  currentWindow?: boolean
  index?: number
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
      reload: vi.fn((...args: unknown[]) => {
        const callback = args[args.length - 1]
        if (typeof callback === "function") {
          callback()
        }
        return Promise.resolve()
      }),
      captureVisibleTab: vi.fn((...args: unknown[]) => {
        const callback = args[args.length - 1]
        const dataUrl = "data:image/png;base64,AAAA"
        if (typeof callback === "function") {
          callback(dataUrl)
        }
        return Promise.resolve(dataUrl)
      }),
      goBack: vi.fn((_tabId: number, callback?: Function) => {
        callback?.()
        return Promise.resolve()
      }),
      goForward: vi.fn((_tabId: number, callback?: Function) => {
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
    },
  }

  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", chromeApi)
}

beforeEach(() => {
  fakeBrowser.reset()
  tabs = defaultTabs.map((tab) => ({ ...tab }))
  permissionAccess = grantAllPermissions()
  installChromeStubs()
})

describe("representative browser tab commands", () => {
  it("uses browser APIs for open, pin, close, and query behaviors", async () => {
    await executeCommand(openNewTab.id, normalContext, {})
    expect(chromeApi.tabs.create).toHaveBeenCalledWith(
      { index: undefined },
      expect.any(Function),
    )

    await executeCommand(pinCurrentTab.id, normalContext, {})
    expect(chromeApi.tabs.update).toHaveBeenCalledWith(
      1,
      { pinned: true },
      expect.any(Function),
    )

    await executeCommand(closeCurrentTab.id, normalContext, {})
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(1, expect.any(Function))
  })

  it("closes duplicate tabs while keeping one tab per URL across windows", async () => {
    tabs = [
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
      {
        id: 3,
        title: "Example duplicate",
        url: "https://example.com/page",
        windowId: 10,
        active: false,
        currentWindow: true,
        index: 2,
      },
      {
        id: 4,
        title: "Docs duplicate in another window",
        url: "https://docs.example.com/",
        windowId: 11,
        active: false,
        currentWindow: false,
        index: 0,
      },
    ]

    await executeCommand(closeDuplicateTabs.id, normalContext, {})

    // One duplicate per URL group is closed; the kept tabs stay open.
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(3, expect.any(Function))
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(4, expect.any(Function))
    expect(chromeApi.tabs.remove).toHaveBeenCalledTimes(2)
    expect(tabs.map((tab) => tab.id).sort()).toEqual([1, 2])
  })

  it("duplicates the active tab with native duplicate and modifier behavior", async () => {
    await executeCommand(duplicateCurrentTab.id, normalContext, {})
    expect(chromeApi.tabs.duplicate).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    )

    await executeCommand(
      duplicateCurrentTab.id,
      { ...normalContext, modifierKey: "shift" },
      {},
    )
    expect(chromeApi.tabs.move).toHaveBeenCalledWith(
      expect.any(Number),
      { index: 0 },
      expect.any(Function),
    )

    await executeCommand(
      duplicateCurrentTab.id,
      { ...normalContext, modifierKey: "cmd" },
      {},
    )
    expect(chromeApi.tabs.update).toHaveBeenCalledWith(
      1,
      { active: true },
      expect.any(Function),
    )
  })

  it("moves the active tab left, right, and around window boundaries", async () => {
    await executeCommand(moveTabRight.id, normalContext, {})
    expect(chromeApi.tabs.move).toHaveBeenLastCalledWith(
      1,
      { index: 1 },
      expect.any(Function),
    )

    tabs = tabs.map((tab) => ({
      ...tab,
      active: tab.id === 2,
      index: tab.id === 2 ? 1 : 0,
    }))

    await executeCommand(moveTabRight.id, normalContext, {})
    expect(chromeApi.tabs.move).toHaveBeenLastCalledWith(
      2,
      { index: 0 },
      expect.any(Function),
    )

    tabs = tabs.map((tab) => ({
      ...tab,
      active: tab.id === 1,
      index: tab.id === 1 ? 0 : 1,
    }))

    await executeCommand(moveTabLeft.id, normalContext, {})
    expect(chromeApi.tabs.move).toHaveBeenLastCalledWith(
      1,
      { index: 1 },
      expect.any(Function),
    )
  })

  it("mutes, unmutes, reloads, and navigates the active tab", async () => {
    await executeCommand(muteCurrentTab.id, normalContext, {})
    expect(chromeApi.tabs.update).toHaveBeenCalledWith(
      1,
      { muted: true },
      expect.any(Function),
    )

    await executeCommand(unmuteCurrentTab.id, normalContext, {})
    expect(chromeApi.tabs.update).toHaveBeenCalledWith(
      1,
      { muted: false },
      expect.any(Function),
    )

    await executeCommand(reloadCurrentTab.id, normalContext, {})
    expect(chromeApi.tabs.reload).toHaveBeenCalledWith(expect.any(Function))

    await executeCommand(
      reloadCurrentTab.id,
      { ...normalContext, modifierKey: "cmd" },
      {},
    )
    expect(chromeApi.tabs.reload).toHaveBeenCalledWith(
      1,
      { bypassCache: true },
      expect.any(Function),
    )

    await executeCommand(goBackCommand.id, normalContext, {})
    expect(chromeApi.tabs.goBack).toHaveBeenCalledWith(1, expect.any(Function))

    await executeCommand(goForwardCommand.id, normalContext, {})
    expect(chromeApi.tabs.goForward).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    )
  })

  it("captures a screenshot to the clipboard on Enter and to a download on Cmd", async () => {
    await executeCommand(captureScreenshot.id, normalContext, {})
    // Palette is hidden before the visible-area capture so it isn't in the shot.
    expect(chromeApi.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: "hide-ui" },
      expect.any(Function),
    )
    expect(chromeApi.tabs.captureVisibleTab).toHaveBeenCalledWith(
      10,
      { format: "png" },
      expect.any(Function),
    )
    expect(chromeApi.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: "monocle-screenshot",
        mode: "clipboard",
        dataUrl: "data:image/png;base64,AAAA",
      }),
      expect.any(Function),
    )

    await executeCommand(
      captureScreenshot.id,
      { ...normalContext, modifierKey: "cmd" },
      {},
    )
    expect(chromeApi.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: "monocle-screenshot",
        mode: "download",
        dataUrl: "data:image/png;base64,AAAA",
        filename: expect.stringMatching(/^screenshot-example\.com-.*\.png$/),
      }),
      expect.any(Function),
    )
  })
})

describe("representative browser window commands", () => {
  it("uses browser APIs for opening and closing windows", async () => {
    await executeCommand(openNewWindow.id, normalContext, {})
    expect(chromeApi.windows.create).toHaveBeenCalledWith(
      {},
      expect.any(Function),
    )

    await executeCommand(openNewPrivateWindow.id, normalContext, {})
    expect(chromeApi.windows.create).toHaveBeenCalledWith(
      { incognito: true },
      expect.any(Function),
    )

    await executeCommand(closeCurrentWindow.id, normalContext, {})
    expect(chromeApi.windows.remove).toHaveBeenCalledWith(
      10,
      expect.any(Function),
    )
  })

  it("moves the active tab into regular and popup windows", async () => {
    await executeCommand(moveCurrentTabToANewWindow.id, normalContext, {})
    expect(chromeApi.windows.create).toHaveBeenCalledWith(
      { tabId: 1, focused: true },
      expect.any(Function),
    )

    await executeCommand(moveCurrentTabToPopupWindow.id, normalContext, {})
    expect(chromeApi.windows.create).toHaveBeenCalledWith(
      { tabId: 1, type: "popup" },
      expect.any(Function),
    )
  })
})
