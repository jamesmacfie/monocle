import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { getFavoriteCommandIds, toggleFavoriteCommandId } from "./favorites"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
    },
  })
}

beforeEach(() => {
  fakeBrowser.reset()
  installBrowserStubs()
})

describe("favorites concurrent toggles", () => {
  it("keeps both favorites when two commands are toggled concurrently", async () => {
    // Without the storage lock both toggles read the same empty list and the
    // second save drops the first command.
    const [first, second] = await Promise.all([
      toggleFavoriteCommandId("command-a"),
      toggleFavoriteCommandId("command-b"),
    ])

    expect(first).toBe(true)
    expect(second).toBe(true)
    await expect(getFavoriteCommandIds()).resolves.toEqual([
      "command-a",
      "command-b",
    ])
  })

  it("serializes a double toggle of the same command back to off", async () => {
    await Promise.all([
      toggleFavoriteCommandId("command-a"),
      toggleFavoriteCommandId("command-a"),
    ])

    await expect(getFavoriteCommandIds()).resolves.toEqual([])
  })
})
