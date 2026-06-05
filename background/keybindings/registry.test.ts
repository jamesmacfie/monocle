import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import { clearAllSettings, updateCommandSettings } from "../commands/settings"
import { checkKeybindingConflict } from "../messages/checkKeybindingConflict"
import {
  getCommandIdForKeybinding,
  getCommandIdFromSnapshot,
  getKeybindingRegistrySnapshot,
  initializeKeybindingRegistry,
} from "./registry"

const normalContext: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

const newTabContext: Browser.Context = {
  url: "chrome-extension://monocle-test/newtab.html",
  title: "",
  modifierKey: null,
  isNewTab: true,
}

const githubContext: Browser.Context = {
  url: "https://github.com/acme/widgets/pull/42",
  title: "Pull Request",
  modifierKey: null,
}

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
  const chromeApi = {
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
      }),
    },
    sessions: {
      getRecentlyClosed: vi.fn((_filter: object, callback?: Function) => {
        callback?.([])
      }),
    },
    downloads: {
      search: vi.fn((_query: object, callback?: Function) => {
        callback?.([])
      }),
    },
    history: {
      search: vi.fn((_query: object, callback?: Function) => {
        callback?.([])
      }),
    },
  }

  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", chromeApi)
}

describe("keybinding registry", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installChromeStubs()
    await clearAllSettings()
  })

  it("normalizes default registry insertion and Firefox command aliases", async () => {
    await initializeKeybindingRegistry(undefined, { platform: "firefox" })

    expect(getCommandIdForKeybinding("<cmd-t>")).toBe("open-new-tab")
    expect(getCommandIdForKeybinding("<alt-cmd-R>")).toBe("toggle-reader-mode")
    expect(getCommandIdForKeybinding("<cmd-alt-r>")).toBe("toggle-reader-mode")
  })

  it("builds context-aware snapshots for browser, tool, UI, new-tab, website, and deep-search commands", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<shift-cmd-U>",
    })
    await updateCommandSettings("toggle-theme", {
      keybinding: "<alt-cmd-T>",
    })
    await updateCommandSettings("toggle-clock-visibility", {
      keybinding: "<cmd-alt-C>",
    })
    await updateCommandSettings("github-toggle-star", {
      keybinding: "<cmd-alt-G>",
    })
    await updateCommandSettings("bookmark-b1", {
      keybinding: "<cmd-alt-B>",
    })

    const normalSnapshot = await getKeybindingRegistrySnapshot(normalContext)
    expect(getCommandIdFromSnapshot(normalSnapshot, "<cmd-t>")).toBe(
      "open-new-tab",
    )
    expect(getCommandIdFromSnapshot(normalSnapshot, "<cmd-shift-u>")).toBe(
      "uuidv4",
    )
    expect(getCommandIdFromSnapshot(normalSnapshot, "<cmd-alt-t>")).toBe(
      "toggle-theme",
    )
    expect(getCommandIdFromSnapshot(normalSnapshot, "<cmd-alt-b>")).toBe(
      "bookmark-b1",
    )
    expect(
      getCommandIdFromSnapshot(normalSnapshot, "<cmd-alt-c>"),
    ).toBeUndefined()
    expect(
      getCommandIdFromSnapshot(normalSnapshot, "<cmd-alt-g>"),
    ).toBeUndefined()

    const newTabSnapshot = await getKeybindingRegistrySnapshot(newTabContext)
    expect(getCommandIdFromSnapshot(newTabSnapshot, "<cmd-alt-c>")).toBe(
      "toggle-clock-visibility",
    )

    const githubSnapshot = await getKeybindingRegistrySnapshot(githubContext)
    expect(getCommandIdFromSnapshot(githubSnapshot, "<cmd-alt-g>")).toBe(
      "github-toggle-star",
    )
  })

  it("tracks sequence prefixes for preflight suppression", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "g, <alt-cmd-U>",
    })

    const snapshot = await getKeybindingRegistrySnapshot(normalContext)

    expect(getCommandIdFromSnapshot(snapshot, "g")).toBeUndefined()
    expect(snapshot.sequencePrefixes.has("g")).toBe(true)
    expect(getCommandIdFromSnapshot(snapshot, "g, <cmd-alt-u>")).toBe("uuidv4")
  })

  it("detects conflicts after canonical normalization", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<shift-cmd-U>",
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "<cmd-shift-u>",
        excludeCommandId: "toggle-theme",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: true,
      conflictingCommand: {
        id: "uuidv4",
        name: "Copy UUID v4",
      },
    })
  })

  it("checks new-tab keybinding conflicts only in new-tab context", async () => {
    await updateCommandSettings("toggle-clock-visibility", {
      keybinding: "<cmd-alt-c>",
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "<alt-cmd-c>",
        excludeCommandId: "toggle-theme",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: false,
      conflictingCommand: null,
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "<alt-cmd-c>",
        excludeCommandId: "toggle-theme",
        context: newTabContext,
      }),
    ).resolves.toEqual({
      hasConflict: true,
      conflictingCommand: {
        id: "toggle-clock-visibility",
        name: "Hide Clock",
      },
    })
  })

  it("does not register confirmation-required commands, even with custom settings", async () => {
    await updateCommandSettings("close-current-tab", {
      keybinding: "<cmd-shift-x>",
    })

    const snapshot = await getKeybindingRegistrySnapshot(normalContext)

    expect(getCommandIdFromSnapshot(snapshot, "<cmd-w>")).toBeUndefined()
    expect(getCommandIdFromSnapshot(snapshot, "<cmd-shift-x>")).toBeUndefined()
  })
})
