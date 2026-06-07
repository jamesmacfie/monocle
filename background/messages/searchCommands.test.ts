import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import { executeCommand } from "../commands"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { clearAllSettings, updateCommandSettings } from "../commands/settings"
import { searchCommands } from "./searchCommands"

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
      query: vi.fn(
        (queryInfo: Record<string, unknown>, callback?: Function) => {
          const result = filterTabs(queryInfo)
          callback?.(result)
          return Promise.resolve(result)
        },
      ),
      get: vi.fn((tabId: number, callback?: Function) => {
        const tab = tabs.find((candidate) => candidate.id === tabId)
        callback?.(tab)
        return Promise.resolve(tab)
      }),
      update: vi.fn(
        (tabId: number, updateProperties: object, callback?: Function) => {
          const tab = tabs.find((candidate) => candidate.id === tabId)
          const updated = tab ? Object.assign(tab, updateProperties) : undefined
          callback?.(updated)
          return Promise.resolve(updated)
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
  })
}

const search = async (
  query: string,
  overrides: {
    parentPath?: string[]
    limit?: number
    seq?: number
    context?: Browser.Context
  } = {},
) => {
  return (await searchCommands({
    type: "search-commands",
    context: overrides.context ?? normalContext,
    query,
    parentPath: overrides.parentPath,
    limit: overrides.limit,
    seq: overrides.seq ?? 1,
  })) as any
}

beforeEach(async () => {
  fakeBrowser.reset()
  tabs = defaultTabs.map((tab) => ({ ...tab }))
  installChromeStubs()
  invalidateSearchIndex()
  await clearAllSettings()
})

describe("root search", () => {
  it("echoes seq and query and returns empty results for an empty root query", async () => {
    const response = await search("   ", { seq: 7 })

    expect(response).toEqual({ results: [], seq: 7, query: "   " })
  })

  it("finds root commands by partial name with name matches first", async () => {
    const response = await search("new tab", { seq: 3 })

    expect(response.seq).toBe(3)
    expect(response.query).toBe("new tab")
    expect(response.results[0]?.id).toBe("open-new-tab")
  })

  it("finds deep-search items inline with their rank weight, and they execute from root", async () => {
    const response = await search("docs")
    const docsTab = response.results.find(
      (item: { id: string }) => item.id === "open-tab-2",
    )

    expect(docsTab).toBeDefined()
    expect(docsTab.rankWeight).toBe(0.95)
    expect(docsTab.name).toEqual(["Docs", "Open Tabs"])

    await executeCommand("open-tab-2", normalContext, {})
    expect(
      (chrome.tabs.update as any).mock.calls.some(
        (call: unknown[]) => call[0] === 2,
      ),
    ).toBe(true)
  })

  it("caps results at the requested limit", async () => {
    const unlimited = await search("t")
    expect(unlimited.results.length).toBeGreaterThan(2)
    expect(unlimited.results.length).toBeLessThanOrEqual(40)

    const limited = await search("t", { limit: 2 })
    expect(limited.results.length).toBe(2)
  })

  it("applies URL rules at query time", async () => {
    await updateCommandSettings("open-new-tab", {
      urlRules: { denyUrls: ["*://example.com/*"] },
    })

    const denied = await search("new tab")
    expect(denied.results.map((item: { id: string }) => item.id)).not.toContain(
      "open-new-tab",
    )

    const allowed = await search("new tab", {
      context: { ...normalContext, url: "https://other.example.org/" },
    })
    expect(allowed.results.map((item: { id: string }) => item.id)).toContain(
      "open-new-tab",
    )
  })
})

describe("child page search", () => {
  it("returns all children in load order for an empty child query", async () => {
    const response = await search("", { parentPath: ["open-tabs"], seq: 5 })

    expect(response.seq).toBe(5)
    expect(response.results.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining(["open-tab-1", "open-tab-2"]),
    )
  })

  it("filters children by query via parentPath", async () => {
    const response = await search("docs", { parentPath: ["open-tabs"] })
    const ids = response.results.map((item: { id: string }) => item.id)

    expect(ids).toContain("open-tab-2")
    expect(ids).not.toContain("open-tab-1")
  })
})
