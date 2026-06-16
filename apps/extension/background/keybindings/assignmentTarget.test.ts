import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import { clearAllSettings } from "../commands/settings"
import { resolveKeybindingAssignmentTarget } from "./assignmentTarget"

const pageContext: Browser.Context = {
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
      query: vi.fn((_queryInfo: object, callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
      }),
    },
    bookmarks: {
      getTree: vi.fn((callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
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

describe("keybinding assignment targets", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installChromeStubs()
    await clearAllSettings()
  })

  it("resolves normal commands from the live command tree", async () => {
    await expect(
      resolveKeybindingAssignmentTarget({
        commandId: "open-new-tab",
        context: pageContext,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      behavior: "execute",
      source: "resolved-command",
    })
  })

  it("falls back to catalog rows for context-only commands", async () => {
    await expect(
      resolveKeybindingAssignmentTarget({
        commandId: "toggle-clock-visibility",
        context: pageContext,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      behavior: "execute",
      source: "catalog",
    })
  })

  it("reports missing commands as unassignable", async () => {
    await expect(
      resolveKeybindingAssignmentTarget({
        commandId: "does-not-exist",
        context: pageContext,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      behavior: "execute",
      source: "missing",
    })
  })
})
