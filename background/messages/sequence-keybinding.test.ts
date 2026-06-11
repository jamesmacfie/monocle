import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser, ExecuteKeybindingMessage } from "../../shared/types"
import { clearAllSettings, updateCommandSettings } from "../commands/settings"
import { executeKeybinding } from "./executeKeybinding"

// Force Firefox so firefoxCommands (container groups) load in loadAllCommands.
vi.mock("../../shared/utils/browser", () => ({
  isFirefox: true,
  isChrome: false,
}))

// Return a container so the dynamic child exists during registry build.
vi.mock("../utils/firefox", () => ({
  queryContainers: vi.fn(async () => [
    {
      cookieStoreId: "firefox-container-1",
      name: "Work",
      colorCode: "#37adff",
      iconUrl: "resource://usercontext-content/briefcase.svg",
    },
  ]),
  toggleReaderMode: vi.fn(async () => {}),
  saveAsPDF: vi.fn(async () => {}),
}))

const context: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

const createSpy = vi.fn(async () => ({ id: 99 }))

const installChromeStubs = () => {
  const chromeApi = {
    runtime: {
      id: "monocle-test",
      getURL: () => "moz-extension://monocle-test/",
      lastError: null,
    },
    permissions: { contains: vi.fn(async () => true) },
    tabs: { create: createSpy },
  }
  // Code reads the WXT-imported `browser` (fakeBrowser), so grant on it directly.
  const fb = fakeBrowser as any
  fb.permissions = { contains: vi.fn(async () => true) }
  fb.tabs = { ...fb.tabs, create: createSpy }
  vi.stubGlobal("chrome", chromeApi)
}

const press = (key: string): Promise<any> =>
  executeKeybinding(
    {
      type: "execute-keybinding",
      keybinding: key,
      context,
    } as ExecuteKeybindingMessage,
    { tab: { id: 7 }, documentId: "doc-1" },
  )

describe("sequential keybinding execution", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installChromeStubs()
    createSpy.mockClear()
    await clearAllSettings()
    await updateCommandSettings("open-container-tab-firefox-container-1", {
      keybinding: "c, n, p",
    })
  })

  it("resolves c -> n -> p sequentially and executes the bound command", async () => {
    const first = await press("c")
    expect(first).toMatchObject({ success: true, pending: true })

    const second = await press("n")
    expect(second).toMatchObject({ success: true, pending: true })

    const third = await press("p")
    expect(third).toMatchObject({ success: true, executed: true })

    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it("resolves c -> n -> p when the strokes overlap (fast typing)", async () => {
    // Each keydown dispatches an independent async execute-keybinding; the
    // handler does slow work (registry rebuild) between mutating and reading
    // the shared sequence state. Fire them without awaiting in between.
    await Promise.all([press("c"), press("n"), press("p")])

    // Regression: without per-scope serialization the shared sequence state is
    // read across the awaited registry rebuild, so all three overlapping
    // handlers see "c, n, p" and each fires executeNow (command runs 3x).
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it("executes a standalone first stroke immediately when unrelated sequences exist", async () => {
    await updateCommandSettings("open-new-tab", {
      keybinding: "t",
    })

    await expect(press("t")).resolves.toMatchObject({
      success: true,
      executed: true,
    })
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it("returns an open-palette instruction for open-page keybindings", async () => {
    await updateCommandSettings("add-bookmark", {
      keybinding: "a",
    })

    await expect(press("a")).resolves.toMatchObject({
      success: true,
      executed: false,
      openPaletteAtCommand: {
        commandId: "add-bookmark",
      },
    })
  })
})
