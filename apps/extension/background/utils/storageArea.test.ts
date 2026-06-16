import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { createStorageArea } from "./storageArea"

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

type Bag = { items: string[] }

describe("createStorageArea", () => {
  it("returns a fresh default on a cold read", async () => {
    const area = createStorageArea<Bag>({
      key: "monocle-test-bag",
      defaults: () => ({ items: [] }),
    })

    await expect(area.load()).resolves.toEqual({ items: [] })

    // The default is produced per call, never a shared reference that a caller
    // could mutate into the next default.
    const first = await area.load()
    first.items.push("mutated")
    await expect(area.load()).resolves.toEqual({ items: [] })
  })

  it("round-trips save and load", async () => {
    const area = createStorageArea<Bag>({
      key: "monocle-test-bag",
      defaults: () => ({ items: [] }),
    })

    await area.save({ items: ["a", "b"] })
    await expect(area.load()).resolves.toEqual({ items: ["a", "b"] })
  })

  it("update applies a locked read-modify-write and returns the new value", async () => {
    const area = createStorageArea<Bag>({
      key: "monocle-test-bag",
      defaults: () => ({ items: [] }),
    })

    const next = await area.update((current) => ({
      items: [...current.items, "x"],
    }))

    expect(next).toEqual({ items: ["x"] })
    await expect(area.load()).resolves.toEqual({ items: ["x"] })
  })

  it("serializes concurrent updates so none are lost", async () => {
    const area = createStorageArea<Bag>({
      key: "monocle-test-bag",
      defaults: () => ({ items: [] }),
    })

    // Without the lock both updates would read the same empty bag and the
    // second save would drop the first append.
    await Promise.all([
      area.update((current) => ({ items: [...current.items, "a"] })),
      area.update((current) => ({ items: [...current.items, "b"] })),
    ])

    const result = await area.load()
    expect(result.items.sort()).toEqual(["a", "b"])
  })

  it("remove resets the key back to the default", async () => {
    const area = createStorageArea<Bag>({
      key: "monocle-test-bag",
      defaults: () => ({ items: [] }),
    })

    await area.save({ items: ["a"] })
    await area.remove()
    await expect(area.load()).resolves.toEqual({ items: [] })
  })
})
