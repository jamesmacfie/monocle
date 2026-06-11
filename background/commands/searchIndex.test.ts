import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser, CommandNode, GroupCommandNode } from "../../shared/types"
import { browsingHistory } from "./browser/history"
import { openTabs } from "./browser/openTabs"
import { toggleFavoriteCommandId } from "./favorites"
import {
  dropSearchIndexCaches,
  filterIndexEntriesByUrl,
  getSearchIndex,
  initializeSearchIndexInvalidation,
  invalidateSearchIndex,
} from "./searchIndex"
import { clearAllSettings } from "./settings"
import { calculator } from "./tools/calculator"

const normalContext: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
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
        (_queryInfo: Record<string, unknown>, callback?: Function) => {
          callback?.([])
          return Promise.resolve([])
        },
      ),
      get: vi.fn((_tabId: number, callback?: Function) => {
        callback?.(undefined)
        return Promise.resolve(undefined)
      }),
    },
  })
}

const makeAction = (
  id: string,
  name: string,
  dedupeKey?: string,
): CommandNode => ({
  type: "action",
  id,
  name,
  actionLabel: "Open",
  execute: vi.fn(),
  dedupeKey,
})

const openTabsGroup = openTabs as GroupCommandNode
const historyGroup = browsingHistory as GroupCommandNode
const calculatorGroup = calculator as GroupCommandNode

const originalOpenTabsChildren = openTabsGroup.children
const originalHistoryChildren = historyGroup.children
const originalCalculatorChildren = calculatorGroup.children

beforeEach(async () => {
  fakeBrowser.reset()
  installChromeStubs()
  // Full reset: plain invalidation retains a stale-while-revalidate snapshot,
  // which would leak the previous test's index into the next one.
  dropSearchIndexCaches()
  await clearAllSettings()
})

afterEach(() => {
  openTabsGroup.children = originalOpenTabsChildren
  historyGroup.children = originalHistoryChildren
  calculatorGroup.children = originalCalculatorChildren
  vi.useRealTimers()
})

describe("index build sharing and skipping", () => {
  it("resolves each group's children exactly once for favorites and deep search", async () => {
    const children = vi.fn(async () => [
      makeAction("synthetic-tab-1", "Synthetic Tab One"),
      makeAction("synthetic-tab-2", "Synthetic Tab Two"),
    ])
    openTabsGroup.children = children

    // Favorite a flattened child so both the favorites collection and the
    // deep-search flatten need this group's children
    await toggleFavoriteCommandId("synthetic-tab-1")

    const index = await getSearchIndex(normalContext)

    expect(children).toHaveBeenCalledTimes(1)

    const entry = index.entries.find((item) => item.id === "synthetic-tab-1")
    expect(entry).toBeDefined()
    expect(entry?.isFavorite).toBe(true)
    expect(entry?.fromDeepSearch).toBe(true)
    expect(entry?.sourceWeight).toBe(0.95)
  })

  it("skips descending into non-deep-search groups when there are no favorites", async () => {
    const children = vi.fn(async () => [])
    calculatorGroup.children = children

    await getSearchIndex(normalContext)
    expect(children).not.toHaveBeenCalled()

    // Hard reset: this test verifies build behavior with favorites present,
    // not stale-while-revalidate serving.
    dropSearchIndexCaches()
    await toggleFavoriteCommandId("uuidv4")

    await getSearchIndex(normalContext)
    expect(children).toHaveBeenCalledTimes(1)
  })
})

describe("dedupe at index build", () => {
  it("collapses identical ids keeping the highest-weight entry (Pass A)", async () => {
    openTabsGroup.children = async () => [
      makeAction("dup-item", "Duplicated Item"),
    ]
    historyGroup.children = async () => [
      makeAction("dup-item", "Duplicated Item"),
    ]

    const index = await getSearchIndex(normalContext)
    const dupEntries = index.entries.filter((entry) => entry.id === "dup-item")

    expect(dupEntries).toHaveLength(1)
    expect(dupEntries[0].sourceWeight).toBe(0.95)
  })

  it("collapses by dedupeKey across sources keeping the highest weight (Pass B)", async () => {
    openTabsGroup.children = async () => [
      makeAction("tab-a", "Example Page", "https://example.com/x"),
    ]
    historyGroup.children = async () => [
      makeAction("hist-a", "Example Page", "https://example.com/x"),
      makeAction("hist-b", "Other Page", "https://example.com/y"),
    ]

    const index = await getSearchIndex(normalContext)
    const ids = index.entries.map((entry) => entry.id)

    expect(ids).toContain("tab-a")
    expect(ids).not.toContain("hist-a")
    expect(ids).toContain("hist-b")
  })

  it("folds a dropped same-URL entry's name into the survivor's keywords so it stays findable", async () => {
    // Same URL, different names: the open tab wins on weight, but the history
    // entry's distinct name must still reach the surviving row.
    openTabsGroup.children = async () => [
      makeAction("tab-a", "Pull requests · GitHub", "https://github.com/pulls"),
    ]
    historyGroup.children = async () => [
      makeAction("hist-a", "My Saved Search", "https://github.com/pulls"),
    ]

    const index = await getSearchIndex(normalContext)
    const survivor = index.entries.find((entry) => entry.id === "tab-a")

    expect(survivor).toBeDefined()
    expect(index.entries.map((entry) => entry.id)).not.toContain("hist-a")
    // The dropped name is searchable on the survivor.
    expect(survivor?.keywordsLower).toContain("my saved search")
    // Tokens were recomputed so the per-keystroke scorer sees the merged terms.
    expect(survivor?.restFields).toContain("my saved search")
  })
})

describe("cache lifecycle", () => {
  it("serves from cache, then serves stale and rebuilds in the background on invalidate and TTL expiry", async () => {
    const children = vi.fn(async () => [
      makeAction("synthetic-tab-1", "Synthetic Tab One"),
    ])
    openTabsGroup.children = children

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-07T00:00:00Z"))

    const first = await getSearchIndex(normalContext)
    const second = await getSearchIndex(normalContext)
    expect(second).toBe(first)
    expect(children).toHaveBeenCalledTimes(1)

    // Stale-while-revalidate: the query that follows a browser-data
    // invalidation is answered from the previous index while the rebuild
    // runs in the background.
    invalidateSearchIndex({ retainStale: true })
    const staleServed = await getSearchIndex(normalContext)
    expect(staleServed).toBe(first)
    await vi.waitFor(() => {
      expect(children).toHaveBeenCalledTimes(2)
    })
    const fresh = await getSearchIndex(normalContext)
    expect(fresh).not.toBe(first)

    // TTL expiry behaves the same way: stale served, rebuild backgrounded.
    vi.setSystemTime(new Date("2026-06-07T00:00:31Z"))
    const staleAfterTtl = await getSearchIndex(normalContext)
    expect(staleAfterTtl).toBe(fresh)
    await vi.waitFor(() => {
      expect(children).toHaveBeenCalledTimes(3)
    })
  })

  it("rebuilds when switching between page and new-tab contexts", async () => {
    const pageIndex = await getSearchIndex(normalContext)
    expect(pageIndex.entries.map((entry) => entry.id)).not.toContain(
      "new-tab-clock",
    )

    const newTabIndex = await getSearchIndex({
      ...normalContext,
      isNewTab: true,
    })
    expect(newTabIndex.contextKey).not.toBe(pageIndex.contextKey)
    expect(newTabIndex.entries.map((entry) => entry.id)).toContain(
      "new-tab-clock",
    )
  })
})

describe("query-time URL filtering", () => {
  it("keeps the cache across URL changes and filters entries per query", async () => {
    const first = await getSearchIndex(normalContext)
    const second = await getSearchIndex({
      ...normalContext,
      url: "https://other.example.org/",
    })

    // URL is not part of the cache key
    expect(second).toBe(first)

    const settings = {
      "open-new-tab": {
        urlRules: { denyUrls: ["*://example.com/*"] },
      },
    }

    const filteredForExample = filterIndexEntriesByUrl(
      first.entries,
      "https://example.com/page",
      settings,
    )
    expect(filteredForExample.map((entry) => entry.id)).not.toContain(
      "open-new-tab",
    )

    const filteredForOther = filterIndexEntriesByUrl(
      first.entries,
      "https://other.example.org/",
      settings,
    )
    expect(filteredForOther.map((entry) => entry.id)).toContain("open-new-tab")
  })

  it("hides deep-search entries when an ancestor group is URL-denied", async () => {
    openTabsGroup.children = async () => [
      makeAction("synthetic-tab-1", "Synthetic Tab One"),
    ]

    const index = await getSearchIndex(normalContext)
    const settings = {
      "open-tabs": {
        urlRules: { denyUrls: ["*://example.com/*"] },
      },
    }

    const filtered = filterIndexEntriesByUrl(
      index.entries,
      "https://example.com/page",
      settings,
    )

    expect(filtered.map((entry) => entry.id)).not.toContain("synthetic-tab-1")
    expect(filtered.map((entry) => entry.id)).not.toContain("open-tabs")
  })
})

describe("stale-while-revalidate bounds", () => {
  it("serves the stale index immediately while a slow rebuild is in flight", async () => {
    let release: (() => void) | undefined
    const fastChildren = vi.fn(async () => [
      makeAction("synthetic-tab-1", "Synthetic Tab One"),
    ])
    openTabsGroup.children = fastChildren

    const first = await getSearchIndex(normalContext)

    invalidateSearchIndex({ retainStale: true })
    const slowChildren = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return [makeAction("synthetic-tab-2", "Synthetic Tab Two")]
    })
    openTabsGroup.children = slowChildren

    // Must resolve without waiting on the deferred rebuild.
    const staleServed = await getSearchIndex(normalContext)
    expect(staleServed).toBe(first)

    // The background rebuild reaches the deferred children() only after a few
    // awaits; wait until the deferred is armed before releasing it.
    await vi.waitFor(() => {
      expect(release).toBeDefined()
    })
    release?.()
    await vi.waitFor(async () => {
      const fresh = await getSearchIndex(normalContext)
      expect(fresh).not.toBe(first)
    })
  })

  it("blocks on the rebuild once the stale index exceeds the serve limit", async () => {
    const children = vi.fn(async () => [
      makeAction("synthetic-tab-1", "Synthetic Tab One"),
    ])
    openTabsGroup.children = children

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-07T00:00:00Z"))

    const first = await getSearchIndex(normalContext)
    invalidateSearchIndex({ retainStale: true })

    // Past the 4x TTL stale-serve ceiling the caller must get fresh data.
    vi.setSystemTime(new Date("2026-06-07T00:02:01Z"))
    const fresh = await getSearchIndex(normalContext)
    expect(fresh).not.toBe(first)
    expect(children).toHaveBeenCalledTimes(2)
  })
})

describe("tab event invalidation scope", () => {
  const installEventStubs = () => {
    const updatedListeners: Array<
      (tabId: number, changeInfo: Record<string, unknown>) => void
    > = []
    const onActivatedAddListener = vi.fn()

    vi.stubGlobal("chrome", {
      runtime: {
        id: "monocle-test",
        getURL: () => "chrome-extension://monocle-test/",
        lastError: null,
      },
      permissions: { contains: vi.fn(async () => true) },
      tabs: {
        query: vi.fn(
          (_queryInfo: Record<string, unknown>, callback?: Function) => {
            callback?.([])
            return Promise.resolve([])
          },
        ),
        onCreated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onUpdated: {
          addListener: (
            listener: (
              tabId: number,
              changeInfo: Record<string, unknown>,
            ) => void,
          ) => {
            updatedListeners.push(listener)
          },
        },
        onActivated: { addListener: onActivatedAddListener },
      },
    })
    vi.stubGlobal("browser", undefined)

    return { updatedListeners, onActivatedAddListener }
  }

  it("ignores loading/favicon-only tab updates and never listens to onActivated", async () => {
    const children = vi.fn(async () => [
      makeAction("synthetic-tab-1", "Synthetic Tab One"),
    ])
    openTabsGroup.children = children

    const { updatedListeners, onActivatedAddListener } = installEventStubs()
    initializeSearchIndexInvalidation()

    expect(onActivatedAddListener).not.toHaveBeenCalled()
    expect(updatedListeners).toHaveLength(1)

    const first = await getSearchIndex(normalContext)

    // Status-only update: index survives untouched.
    updatedListeners[0](1, { status: "loading" })
    const afterStatus = await getSearchIndex(normalContext)
    expect(afterStatus).toBe(first)
    expect(children).toHaveBeenCalledTimes(1)

    // Title update: invalidates (stale served, rebuild backgrounded).
    updatedListeners[0](1, { title: "New Title" })
    await getSearchIndex(normalContext)
    await vi.waitFor(() => {
      expect(children).toHaveBeenCalledTimes(2)
    })
  })
})
