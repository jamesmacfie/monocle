import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { getFavoriteCommandIds } from "../commands/favorites"
import { setCommandFavorite } from "./setCommandFavorite"

const installChromeStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
  })
}

describe("setCommandFavorite message handler", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installChromeStubs()
    await fakeBrowser.storage.local.remove("monocle-favoriteCommandIds")
  })

  it("sets and removes favorites without requiring the command to be visible", async () => {
    await expect(
      setCommandFavorite({
        type: "monocle-command-favorite-set",
        id: "open-new-tab",
        favorite: true,
      }),
    ).resolves.toEqual({ success: true })

    await expect(getFavoriteCommandIds()).resolves.toContain("open-new-tab")

    await expect(
      setCommandFavorite({
        type: "monocle-command-favorite-set",
        id: "open-new-tab",
        favorite: false,
      }),
    ).resolves.toEqual({ success: true })

    await expect(getFavoriteCommandIds()).resolves.not.toContain("open-new-tab")
  })
})
