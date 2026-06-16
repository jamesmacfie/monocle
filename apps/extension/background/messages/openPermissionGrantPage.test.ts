import { beforeEach, describe, expect, it, vi } from "vitest"
import { openPermissionGrantPage } from "./openPermissionGrantPage"

const installChromeStubs = () => {
  vi.stubGlobal("browser", undefined)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: vi.fn((path: string) => `moz-extension://monocle-test${path}`),
    },
    tabs: {
      create: vi.fn(async () => ({ id: 1 })),
    },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
  installChromeStubs()
})

describe("openPermissionGrantPage", () => {
  it("opens the extension new-tab page with the requested permission", async () => {
    await expect(
      openPermissionGrantPage({
        type: "open-permission-grant-page",
        permission: "bookmarks",
      }),
    ).resolves.toEqual({ success: true })

    expect(chrome.runtime.getURL).toHaveBeenCalledWith(
      "/newtab.html?grantPermission=bookmarks",
    )
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: "moz-extension://monocle-test/newtab.html?grantPermission=bookmarks",
    })
  })
})
