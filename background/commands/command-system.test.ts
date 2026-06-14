import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type {
  Browser,
  CommandNode,
  GroupCommandNode,
  SubmitCommandNode,
} from "../../shared/types"
import { initializeKeybindingRegistry } from "../keybindings/registry"
import { invalidateKeybindingEntriesCache } from "../keybindings/source"
import { executeKeybinding } from "../messages/executeKeybinding"
import { getChildrenCommands } from "../messages/getChildrenCommands"
import { getCommands as getCommandMessage } from "../messages/getCommands"
import { searchCommands } from "../messages/searchCommands"
import { toggleFavoriteCommandId } from "./favorites"
import { commandsToSuggestions, executeCommand, getCommands } from "./index"
import { invalidateSearchIndex } from "./searchIndex"
import {
  clearAllSettings,
  getCommandSettings,
  getNewTabClockSettings,
  updateCommandSettings,
} from "./settings"
import { loadAllCommands } from "./source"
import { toolCommands } from "./tools"
import { createSnippet } from "./tools/snippets"
import { manageAllowList } from "./ui/manageAllowList"
import { manageDenyList } from "./ui/manageDenyList"
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
  // A repo-level page: github-toggle-star only renders where the repo star
  // button exists (not on pull/issue detail pages — see websites/github).
  url: "https://github.com/acme/widgets",
  title: "Pull Request",
  modifierKey: null,
}

const newTabContext: Browser.Context = {
  url: "chrome-extension://monocle-test/newtab.html",
  title: "",
  modifierKey: null,
  isNewTab: true,
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

const _getChildren = async (
  id: string,
  context: Browser.Context = normalContext,
  parentPath: string[] = [],
  searchValue?: string,
) => {
  return (await getChildrenCommands({
    type: "get-children-commands",
    id,
    parentPath,
    searchValue,
    context,
  })) as any
}

beforeEach(async () => {
  fakeBrowser.reset()
  tabs = defaultTabs.map((tab) => ({ ...tab }))
  tabMessages = []
  createdTabs = []
  permissionGranted = true
  installChromeStubs()
  invalidateSearchIndex()
  invalidateKeybindingEntriesCache()
  await clearAllSettings()
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
    const snippetGroup = createSnippet as GroupCommandNode
    const originalChildren = snippetGroup.children
    const execute = vi.fn()
    snippetGroup.children = async () => [
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
      snippetGroup.children = originalChildren
    }
  })
})

describe("generated actions", () => {
  it("attaches generated action menus to action, submit, search, and group suggestions", async () => {
    const suggestions = await commandsToSuggestions(
      [
        {
          type: "action",
          id: "test-action",
          name: "Test Action",
          actionLabel: "Run",
          execute: vi.fn(),
        },
        {
          type: "submit",
          id: "test-submit",
          name: "Test Submit",
          actionLabel: "Submit",
          execute: vi.fn(),
        },
        {
          type: "search",
          id: "test-search",
          name: "Test Search",
          actionLabel: "Search",
          getResults: async () => [],
        },
        {
          type: "group",
          id: "test-group",
          name: "Test Group",
          children: async () => [],
        },
      ],
      normalContext,
    )

    for (const suggestion of suggestions) {
      const actions =
        suggestion.type === "action" ||
        suggestion.type === "submit" ||
        suggestion.type === "search" ||
        suggestion.type === "group"
          ? suggestion.actions || []
          : []

      expect(actions.map((action) => action.id)).toContain(
        `${suggestion.id}-enter-action`,
      )
      expect(actions.map((action) => action.id)).toContain(
        `toggle-favorite-${suggestion.id}`,
      )
      expect(actions.map((action) => action.id)).toContain(
        `hide-from-domain-${suggestion.id}`,
      )
      expect(actions.map((action) => action.id)).toContain(
        `hide-command-${suggestion.id}`,
      )
    }
  })

  it("executes generated actions from root, child, dynamic search, and deep-search scopes", async () => {
    await executeCommand("uuidv4-enter-action", normalContext, {})
    expect((await getCommandUsageStats("uuidv4")).totalUsage).toBe(1)

    await executeCommand("hide-command-uuidv4", normalContext, {})
    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      hidden: true,
    })

    const snippetGroup = createSnippet as GroupCommandNode
    const originalCalculatorChildren = snippetGroup.children
    const nestedExecute = vi.fn()
    snippetGroup.children = async () => [
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
        { pageId: "create-snippet", parentPath: ["create-snippet"] },
      )
      expect(nestedExecute).toHaveBeenCalledOnce()
      expect(
        (await getCommandUsageStats("test-nested-action")).parentNames,
      ).toEqual(["Create Snippet"])
    } finally {
      snippetGroup.children = originalCalculatorChildren
    }

    const searchExecute = vi.fn()
    const searchFixture: CommandNode = {
      type: "search",
      id: "test-search-page",
      name: "Test Search",
      actionLabel: "Search",
      getResults: async () => [
        {
          type: "action",
          id: "test-search-result",
          name: "Search Result",
          actionLabel: "Open",
          execute: searchExecute,
        },
      ],
    }
    ;(toolCommands as CommandNode[]).push(searchFixture)

    try {
      await executeCommand(
        "test-search-result-enter-action",
        normalContext,
        {},
        undefined,
        {
          pageId: "test-search-page",
          parentPath: ["test-search-page"],
          searchValue: "widgets",
        },
      )
      expect(searchExecute).toHaveBeenCalledOnce()
    } finally {
      const index = (toolCommands as CommandNode[]).indexOf(searchFixture)
      if (index !== -1) {
        ;(toolCommands as CommandNode[]).splice(index, 1)
      }
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

    const searchResponse = (await searchCommands({
      type: "search-commands",
      context: normalContext,
      query: "docs",
      seq: 1,
    })) as any
    expect(
      searchResponse.results.map((item: { id: string }) => item.id),
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
  it("filters URL-denied root commands from suggestions and favorites", async () => {
    await toggleFavoriteCommandId("open-new-tab")
    await updateCommandSettings("open-new-tab", {
      urlRules: { denyUrls: ["*://example.com/*"] },
    })

    const commands = await getCommands(normalContext)

    expect(commands.suggestions.map((command) => command.id)).not.toContain(
      "open-new-tab",
    )
    expect(commands.favorites.map((command) => command.id)).not.toContain(
      "open-new-tab",
    )
  })

  it("filters hidden root commands from suggestions and favorites", async () => {
    await toggleFavoriteCommandId("open-new-tab")
    await updateCommandSettings("open-new-tab", {
      hidden: true,
    })

    const commands = await getCommands(normalContext)

    expect(commands.suggestions.map((command) => command.id)).not.toContain(
      "open-new-tab",
    )
    expect(commands.favorites.map((command) => command.id)).not.toContain(
      "open-new-tab",
    )
  })

  it("filters URL-denied child commands from child pages and deep search", async () => {
    await updateCommandSettings("open-tab-2", {
      urlRules: { denyUrls: ["*://example.com/*"] },
    })

    const childResponse = await _getChildren("open-tabs")
    expect(
      childResponse.children.map((item: { id: string }) => item.id),
    ).toContain("open-tab-1")
    expect(
      childResponse.children.map((item: { id: string }) => item.id),
    ).not.toContain("open-tab-2")

    // Root search applies URL deny rules to deep-search results at query time.
    // A generous limit keeps deep-search children in scope as the root
    // command catalog of "tab" matches grows.
    const searchResponse = (await searchCommands({
      type: "search-commands",
      context: normalContext,
      query: "tab",
      seq: 1,
      limit: 60,
    })) as any

    expect(
      searchResponse.results.map((item: { id: string }) => item.id),
    ).toContain("open-tab-1")
    expect(
      searchResponse.results.map((item: { id: string }) => item.id),
    ).not.toContain("open-tab-2")
  })

  it("filters hidden child commands from child pages and deep search", async () => {
    await updateCommandSettings("open-tab-2", {
      hidden: true,
    })

    const childResponse = await _getChildren("open-tabs")
    expect(
      childResponse.children.map((item: { id: string }) => item.id),
    ).toContain("open-tab-1")
    expect(
      childResponse.children.map((item: { id: string }) => item.id),
    ).not.toContain("open-tab-2")

    const searchResponse = (await searchCommands({
      type: "search-commands",
      context: normalContext,
      query: "tab",
      seq: 1,
      limit: 60,
    })) as any

    expect(
      searchResponse.results.map((item: { id: string }) => item.id),
    ).toContain("open-tab-1")
    expect(
      searchResponse.results.map((item: { id: string }) => item.id),
    ).not.toContain("open-tab-2")
  })

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

  it("blocks hidden commands through direct execution and keybindings", async () => {
    await updateCommandSettings("open-new-tab", {
      hidden: true,
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

  it("executes new-tab-only command keybindings only with new-tab context", async () => {
    await updateCommandSettings("toggle-clock-visibility", {
      keybinding: "<cmd-alt-c>",
    })

    const normalResponse = await executeKeybinding({
      type: "execute-keybinding",
      keybinding: "<cmd-alt-c>",
      context: normalContext,
    })
    expect(normalResponse).toMatchObject({ success: false })
    await expect(getNewTabClockSettings()).resolves.toEqual({})

    const newTabResponse = await executeKeybinding({
      type: "execute-keybinding",
      keybinding: "<cmd-alt-c>",
      context: newTabContext,
    })

    expect(newTabResponse).toMatchObject({ success: true, executed: true })
    await expect(getNewTabClockSettings()).resolves.toEqual({
      show: false,
    })
  })

  it("stores generated hide-from-domain deny patterns", async () => {
    const docsContext: Browser.Context = {
      url: "https://docs.example.com/reference",
      title: "Docs",
      modifierKey: null,
    }

    await executeCommand("hide-from-domain-bookmarks", docsContext, {})

    await expect(getCommandSettings("bookmarks")).resolves.toEqual({
      urlRules: {
        denyUrls: ["*://*.docs.example.com/*"],
      },
    })
  })
})

describe("URL rule management commands", () => {
  const getManagementSubmit = async (
    command: CommandNode,
    groupId: string,
    submitId: string,
  ): Promise<SubmitCommandNode> => {
    if (command.type !== "group") {
      throw new Error("Expected management command to be a group")
    }

    const groups = await command.children(normalContext)
    const group = groups.find((child) => child.id === groupId)

    if (!group || group.type !== "group") {
      throw new Error(`Expected to find group ${groupId}`)
    }

    const children = await group.children(normalContext)
    const submit = children.find((child) => child.id === submitId)

    if (!submit || submit.type !== "submit") {
      throw new Error(`Expected to find submit command ${submitId}`)
    }

    return submit
  }

  it("includes website and new-tab command sources in URL-rule management", async () => {
    const allowGroups = await manageAllowList.children(normalContext)
    const denyGroups = await manageDenyList.children(normalContext)

    expect(allowGroups.map((command) => command.id)).toContain(
      "github-actions-allow-group",
    )
    expect(allowGroups.map((command) => command.id)).toContain(
      "new-tab-clock-allow-group",
    )
    expect(denyGroups.map((command) => command.id)).toContain(
      "github-actions-deny-group",
    )
    expect(denyGroups.map((command) => command.id)).toContain(
      "new-tab-clock-deny-group",
    )
  })

  it("preserves deny rules and keybindings when saving an allow list", async () => {
    await updateCommandSettings("open-new-tab", {
      keybinding: "<cmd-y>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    const submit = await getManagementSubmit(
      manageAllowList,
      "open-new-tab-allow-group",
      "open-new-tab-save-allow",
    )

    await submit.execute(normalContext, {
      "allow-patterns": "*://allowed.example.com/*",
    })

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "<cmd-y>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
        allowUrls: ["*://allowed.example.com/*"],
      },
    })
  })

  it("preserves allow rules and keybindings when saving a deny list", async () => {
    await updateCommandSettings("open-new-tab", {
      keybinding: "<cmd-y>",
      urlRules: {
        allowUrls: ["*://allowed.example.com/*"],
      },
    })

    const submit = await getManagementSubmit(
      manageDenyList,
      "open-new-tab-deny-group",
      "open-new-tab-save-deny",
    )

    await submit.execute(normalContext, {
      "deny-patterns": "*://blocked.example.com/*",
    })

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "<cmd-y>",
      urlRules: {
        allowUrls: ["*://allowed.example.com/*"],
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })
})
