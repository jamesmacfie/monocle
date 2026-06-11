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
import { invalidateKeybindingEntriesCache } from "./source"

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
  // A repo-level page: github-toggle-star only renders where the repo star
  // button exists (not on pull/issue detail pages — see websites/github).
  url: "https://github.com/acme/widgets",
  title: "acme/widgets",
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
    // Tests mutate settings directly (no message handlers run), so drop the
    // module-level entries cache between tests.
    invalidateKeybindingEntriesCache()
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
      conflictType: "exact",
    })
  })

  it("omits hidden commands from snapshots and conflict checks", async () => {
    await updateCommandSettings("uuidv4", {
      hidden: true,
      keybinding: "<shift-cmd-U>",
    })

    const snapshot = await getKeybindingRegistrySnapshot(normalContext)
    expect(getCommandIdFromSnapshot(snapshot, "<cmd-shift-u>")).toBeUndefined()

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "<cmd-shift-u>",
        excludeCommandId: "toggle-theme",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: false,
      conflictingCommand: null,
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
      conflictType: "exact",
    })
  })

  it("blocks a sequence shadowed by an existing open-palette prefix binding", async () => {
    // add-bookmark is an open-palette binding: it executes immediately on its
    // stroke, so a longer sequence behind it could never fire.
    await updateCommandSettings("add-bookmark", {
      keybinding: "g",
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "g, x",
        excludeCommandId: "uuidv4",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: true,
      conflictingCommand: {
        id: "add-bookmark",
        name: "Add Bookmark",
      },
      conflictType: "shadowed-by-open-palette",
    })
  })

  it("blocks an open-palette binding that would shadow an existing sequence", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "g, x",
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "g",
        excludeCommandId: "add-bookmark",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: true,
      conflictingCommand: {
        id: "uuidv4",
        name: "Copy UUID v4",
      },
      conflictType: "shadowed-by-open-palette",
    })
  })

  it("warns (without blocking) on prefix overlap between execute bindings", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "g",
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "g, x",
        excludeCommandId: "toggle-theme",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: false,
      conflictingCommand: null,
      warnings: [
        {
          type: "prefix-overlap",
          direction: "candidate-extends-existing",
          command: { id: "uuidv4", name: "Copy UUID v4" },
          keybinding: "g",
        },
      ],
    })
  })

  it("warns when an existing sequence extends the candidate binding", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "g, x",
    })

    await expect(
      checkKeybindingConflict({
        type: "check-keybinding-conflict",
        keybinding: "g",
        excludeCommandId: "toggle-theme",
        context: normalContext,
      }),
    ).resolves.toEqual({
      hasConflict: false,
      conflictingCommand: null,
      warnings: [
        {
          type: "prefix-overlap",
          direction: "existing-extends-candidate",
          command: { id: "uuidv4", name: "Copy UUID v4" },
          keybinding: "g, x",
        },
      ],
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

  it("keeps the first registration and warns when two commands share a binding", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      // Conflict checks normally prevent this; write directly to settings to
      // simulate a stale or hand-edited duplicate.
      await updateCommandSettings("uuidv4", {
        keybinding: "<cmd-shift-u>",
      })
      await updateCommandSettings("toggle-theme", {
        keybinding: "<shift-cmd-U>",
      })

      const snapshot = await getKeybindingRegistrySnapshot(normalContext)

      const winner = getCommandIdFromSnapshot(snapshot, "<cmd-shift-u>")
      expect(["uuidv4", "toggle-theme"]).toContain(winner)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Duplicate binding <cmd-shift-u>"),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("serves cached entries for the same context until explicitly invalidated", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<cmd-shift-u>",
    })

    const first = await getKeybindingRegistrySnapshot(normalContext)
    expect(getCommandIdFromSnapshot(first, "<cmd-shift-u>")).toBe("uuidv4")

    // Direct settings write without going through a message handler: the
    // cached entries are intentionally served stale until invalidation.
    await updateCommandSettings("uuidv4", {
      keybinding: "<cmd-shift-y>",
    })

    const cached = await getKeybindingRegistrySnapshot(normalContext)
    expect(getCommandIdFromSnapshot(cached, "<cmd-shift-u>")).toBe("uuidv4")
    expect(getCommandIdFromSnapshot(cached, "<cmd-shift-y>")).toBeUndefined()

    invalidateKeybindingEntriesCache()

    const fresh = await getKeybindingRegistrySnapshot(normalContext)
    expect(getCommandIdFromSnapshot(fresh, "<cmd-shift-u>")).toBeUndefined()
    expect(getCommandIdFromSnapshot(fresh, "<cmd-shift-y>")).toBe("uuidv4")
  })

  it("rebuilds cached entries after the TTL expires", async () => {
    vi.useFakeTimers()
    try {
      await updateCommandSettings("uuidv4", {
        keybinding: "<cmd-shift-u>",
      })

      const first = await getKeybindingRegistrySnapshot(normalContext)
      expect(getCommandIdFromSnapshot(first, "<cmd-shift-u>")).toBe("uuidv4")

      await updateCommandSettings("uuidv4", {
        keybinding: "<cmd-shift-y>",
      })

      vi.advanceTimersByTime(31_000)

      const fresh = await getKeybindingRegistrySnapshot(normalContext)
      expect(getCommandIdFromSnapshot(fresh, "<cmd-shift-y>")).toBe("uuidv4")
    } finally {
      vi.useRealTimers()
    }
  })
})
