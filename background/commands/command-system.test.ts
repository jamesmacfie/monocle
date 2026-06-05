import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser, GroupCommandNode } from "../../shared/types"
import { initializeKeybindingRegistry } from "../keybindings/registry"
import { executeKeybinding } from "../messages/executeKeybinding"
import { getCommands as getCommandMessage } from "../messages/getCommands"
import { toggleFavoriteCommandId } from "./favorites"
import { executeCommand, getCommands } from "./index"
import { updateCommandSettings } from "./settings"
import { loadAllCommands } from "./source"
import { calculator } from "./tools/calculator"
import { googleSearch } from "./tools/googleSearch"
import { getCommandUsageStats, getRankedCommandIds } from "./usage"

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

const githubContext: Browser.Context = {
  url: "https://github.com/acme/widgets/pull/42",
  title: "Pull Request",
  modifierKey: null,
}

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
let tabMessages: Array<{ tabId: number; message: unknown }> = []
let createdTabs: unknown[] = []
let permissionGranted = true

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
  const chromeApi = {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    permissions: {
      contains: vi.fn(async () => permissionGranted),
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
        createdTabs.push(createProperties)
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
        (tabId: number, message: unknown, callback?: Function) => {
          tabMessages.push({ tabId, message })
          callback?.({ success: true })
          return Promise.resolve({ success: true })
        },
      ),
    },
    windows: {
      update: vi.fn(
        (_windowId: number, _updateInfo: object, callback?: Function) => {
          callback?.({ id: _windowId })
          return Promise.resolve({ id: _windowId })
        },
      ),
    },
  }

  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", chromeApi)
}

beforeEach(() => {
  fakeBrowser.reset()
  tabs = defaultTabs.map((tab) => ({ ...tab }))
  tabMessages = []
  createdTabs = []
  permissionGranted = true
  installChromeStubs()
})

describe("command loading", () => {
  it("loads commands by page context and platform", async () => {
    const normalCommands = await getCommands(normalContext)
    expect(
      normalCommands.suggestions.map((command) => command.id),
    ).not.toContain("new-tab-clock")
    expect(
      normalCommands.suggestions.map((command) => command.id),
    ).not.toContain("github-actions")

    const newTabCommands = await getCommands({
      ...normalContext,
      url: "chrome-extension://monocle-test/newtab.html",
      isNewTab: true,
    })
    expect(newTabCommands.suggestions.map((command) => command.id)).toContain(
      "new-tab-clock",
    )

    const firefoxCommands = loadAllCommands(normalContext, {
      platform: "firefox",
    })
    expect(firefoxCommands.map((command) => command.id)).toContain(
      "toggle-reader-mode",
    )

    const githubCommands = await getCommands(githubContext)
    expect(githubCommands.suggestions.map((command) => command.id)).toContain(
      "github-actions",
    )
  })
})

describe("usage ranking", () => {
  it("records successful executable usage and ranks used commands first", async () => {
    await executeCommand("uuidv4", normalContext, {})
    await executeCommand("uuidv4", normalContext, {})

    const stats = await getCommandUsageStats("uuidv4")
    expect(stats.totalUsage).toBe(2)

    const rankedCommandIds = await getRankedCommandIds()
    expect(rankedCommandIds[0]).toBe("uuidv4")

    const commands = await getCommands(normalContext)
    expect(commands.suggestions[0]?.id).toBe("uuidv4")
  })

  it("does not record submit commands that opt out of recents", async () => {
    const calculatorGroup = calculator as GroupCommandNode
    const originalChildren = calculatorGroup.children
    const execute = vi.fn()
    calculatorGroup.children = async () => [
      {
        type: "submit",
        id: "test-no-recent-submit",
        name: "No Recent Submit",
        actionLabel: "Run",
        doNotAddToRecents: true,
        execute,
      },
    ]

    try {
      await executeCommand("test-no-recent-submit", normalContext, {})
      expect(execute).toHaveBeenCalledOnce()
      expect(
        (await getCommandUsageStats("test-no-recent-submit")).totalUsage,
      ).toBe(0)
    } finally {
      calculatorGroup.children = originalChildren
    }
  })
})

describe("generated actions", () => {
  it("executes generated actions from root, child, dynamic search, and deep-search scopes", async () => {
    await executeCommand("uuidv4-enter-action", normalContext, {})
    expect((await getCommandUsageStats("uuidv4")).totalUsage).toBe(1)

    const calculatorGroup = calculator as GroupCommandNode
    const originalCalculatorChildren = calculatorGroup.children
    const nestedExecute = vi.fn()
    calculatorGroup.children = async () => [
      {
        type: "action",
        id: "test-nested-action",
        name: "Nested Action",
        actionLabel: "Run",
        execute: nestedExecute,
      },
    ]

    try {
      await executeCommand(
        "test-nested-action-enter-action",
        normalContext,
        {},
        undefined,
        { pageId: "calculator", parentPath: ["calculator"] },
      )
      expect(nestedExecute).toHaveBeenCalledOnce()
      expect(
        (await getCommandUsageStats("test-nested-action")).parentNames,
      ).toEqual(["Calculator"])
    } finally {
      calculatorGroup.children = originalCalculatorChildren
    }

    const originalGetResults = googleSearch.getResults
    const searchExecute = vi.fn()
    googleSearch.getResults = async () => [
      {
        type: "action",
        id: "test-search-result",
        name: "Search Result",
        actionLabel: "Open",
        execute: searchExecute,
      },
    ]

    try {
      await executeCommand(
        "test-search-result-enter-action",
        normalContext,
        {},
        undefined,
        {
          pageId: "google-search",
          parentPath: ["google-search"],
          searchValue: "widgets",
        },
      )
      expect(searchExecute).toHaveBeenCalledOnce()
    } finally {
      googleSearch.getResults = originalGetResults
    }

    await executeCommand("open-tab-2-enter-action", normalContext, {})
    expect(
      (chrome.tabs.update as any).mock.calls.some(
        (call: unknown[]) => call[0] === 2,
      ),
    ).toBe(true)
  })
})

describe("favorites and deep search", () => {
  it("keeps deep-search descendants available when the deep-search group is favorited", async () => {
    await toggleFavoriteCommandId("open-tabs")

    const response = (await getCommandMessage({
      type: "get-commands",
      context: normalContext,
    })) as any

    expect(response.favorites.map((item: { id: string }) => item.id)).toContain(
      "open-tabs",
    )
    expect(
      response.suggestions.map((item: { id: string }) => item.id),
    ).not.toContain("open-tabs")
    expect(
      response.deepSearchItems.map((item: { id: string }) => item.id),
    ).toContain("open-tab-2")
  })

  it("resolves favorited children with the real incoming context and URL filtering", async () => {
    await toggleFavoriteCommandId("github-toggle-star")

    const githubCommands = await getCommands(githubContext)
    const githubFavorite = githubCommands.favorites.find(
      (command) => command.id === "github-toggle-star",
    )
    expect(githubFavorite?.name).toEqual([
      "Toggle Star",
      "GitHub: acme/widgets",
    ])

    const normalCommands = await getCommands(normalContext)
    expect(
      normalCommands.favorites.find(
        (command) => command.id === "github-toggle-star",
      ),
    ).toBeUndefined()
  })
})

describe("URL-filtered execution", () => {
  it("blocks URL-denied commands through direct execution and keybindings", async () => {
    await updateCommandSettings("open-new-tab", {
      urlRules: { denyUrls: ["*://example.com/*"] },
    })

    await expect(
      executeCommand("open-new-tab", normalContext, {}),
    ).rejects.toThrow("Command not found")
    expect(createdTabs).toHaveLength(0)

    await initializeKeybindingRegistry()
    const response = await executeKeybinding({
      type: "execute-keybinding",
      keybinding: "<cmd-t>",
      context: normalContext,
    })

    expect(response).toMatchObject({ success: false })
    expect(createdTabs).toHaveLength(0)
  })
})
