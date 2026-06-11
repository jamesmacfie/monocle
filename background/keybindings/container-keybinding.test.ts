import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import { clearAllSettings, updateCommandSettings } from "../commands/settings"
import {
  getCommandIdFromSnapshot,
  getKeybindingRegistrySnapshot,
} from "./registry"
import { invalidateKeybindingEntriesCache } from "./source"

// Force the container query to return a fake container regardless of isFirefox,
// reproducing the runtime where the user has containers available.
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

const firefoxOptions = { platform: "firefox" as Browser.Platform }

const normalContext: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

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
      query: vi.fn((_q: object, cb?: Function) => {
        cb?.([])
        return Promise.resolve([])
      }),
    },
  }
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", chromeApi)
}

describe("container-tab keybindings", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installChromeStubs()
    await clearAllSettings()
    invalidateKeybindingEntriesCache()
  })

  it("registers a c, n, p sequence on a container child", async () => {
    const childId = "open-container-tab-firefox-container-1"
    await updateCommandSettings(childId, { keybinding: "c, n, p" })

    const snapshot = await getKeybindingRegistrySnapshot(
      normalContext,
      firefoxOptions,
    )

    expect(getCommandIdFromSnapshot(snapshot, "c, n, p")).toBe(childId)
    expect(snapshot.sequencePrefixes.has("c")).toBe(true)
    expect(snapshot.sequencePrefixes.has("c, n")).toBe(true)
  })
})
