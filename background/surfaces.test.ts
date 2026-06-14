import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Surface } from "../shared/types"
import {
  clearOwnerSurfaces,
  getSurfacesForUrl,
  initSurfaces,
  removeSurface,
  setOwnerSurfaces,
  upsertSurface,
} from "./surfaces"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: { id: "monocle-test" },
    // broadcastToAllTabs queries tabs to notify them; no tabs in the test env.
    tabs: { query: (_q: unknown, cb: (tabs: unknown[]) => void) => cb([]) },
  })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await fakeBrowser.storage.local.clear()
})

const overlay = (id: string, allowUrls?: string[]): Surface => ({
  id,
  kind: "overlay",
  ...(allowUrls ? { urlMatch: { allowUrls } } : {}),
  blocking: true,
  content: { title: "Blocked" },
})

const badge = (id: string): Surface => ({
  id,
  kind: "badge",
  content: { title: "Focus" },
})

describe("surfaces store", () => {
  it("sets and clears an owner's surfaces", async () => {
    await setOwnerSurfaces("focus-mode", [badge("badge")])
    expect(await getSurfacesForUrl("https://example.com")).toHaveLength(1)

    await clearOwnerSurfaces("focus-mode")
    expect(await getSurfacesForUrl("https://example.com")).toHaveLength(0)
  })

  it("setOwnerSurfaces replaces, never merges", async () => {
    await setOwnerSurfaces("o", [badge("a"), badge("b")])
    await setOwnerSurfaces("o", [badge("c")])
    const ids = (await getSurfacesForUrl("https://x.com")).map((s) => s.id)
    expect(ids).toEqual(["c"])
  })

  it("upsert adds then replaces by id within an owner", async () => {
    await upsertSurface("userscript:1", badge("x"))
    await upsertSurface("userscript:1", {
      ...badge("x"),
      content: { title: "Y" },
    })
    const surfaces = await getSurfacesForUrl("https://x.com")
    expect(surfaces).toHaveLength(1)
    expect(surfaces[0].content.title).toBe("Y")
  })

  it("removeSurface drops one surface, leaving siblings", async () => {
    await setOwnerSurfaces("o", [badge("a"), badge("b")])
    await removeSurface("o", "a")
    const ids = (await getSurfacesForUrl("https://x.com")).map((s) => s.id)
    expect(ids).toEqual(["b"])
  })

  it("stamps each returned surface with its ownerId (for surface-action)", async () => {
    await upsertSurface("command:url-as-qr-code", {
      id: "qr",
      kind: "modal",
      content: { title: "https://x.com" },
    })
    const surfaces = await getSurfacesForUrl("https://x.com")
    expect(surfaces).toHaveLength(1)
    expect(surfaces[0].ownerId).toBe("command:url-as-qr-code")
  })
})

describe("write validation (canonical SurfaceSchema)", () => {
  it("accepts a modal surface carrying structured content blocks", async () => {
    await upsertSurface("command:url-as-qr-code", {
      id: "qr",
      kind: "modal",
      content: {
        title: "https://x.com",
        blocks: [{ type: "image", dataUrl: "data:image/png;base64,AAA" }],
      },
    })
    const surfaces = await getSurfacesForUrl("https://x.com")
    expect(surfaces).toHaveLength(1)
    expect(surfaces[0].content.blocks).toHaveLength(1)
  })

  it("drops invalid surfaces instead of persisting them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    await setOwnerSurfaces("focus-mode", [
      badge("good"),
      // Unknown kind: rejected by the strict schema.
      { id: "bad", kind: "popup", content: {} } as unknown as Surface,
    ])
    const ids = (await getSurfacesForUrl("https://x.com")).map((s) => s.id)
    expect(ids).toEqual(["good"])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("rejects an upsert whose payload fails validation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    await upsertSurface("userscript:1", {
      id: "x",
      kind: "badge",
      // Unknown extra key: strict schema rejects it.
      content: { title: "ok", bogus: true },
    } as unknown as Surface)
    expect(await getSurfacesForUrl("https://x.com")).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe("getSurfacesForUrl URL gating", () => {
  it("includes an overlay only when its allowUrls match", async () => {
    await setOwnerSurfaces("focus-mode", [
      overlay("block", ["*://*.youtube.com/*"]),
    ])
    expect(
      await getSurfacesForUrl("https://www.youtube.com/watch"),
    ).toHaveLength(1)
    expect(await getSurfacesForUrl("https://example.com")).toHaveLength(0)
  })

  it("includes a surface with no urlMatch everywhere (e.g. a badge)", async () => {
    await setOwnerSurfaces("focus-mode", [badge("badge")])
    expect(await getSurfacesForUrl("https://anything.test/x")).toHaveLength(1)
  })

  it("honors denyUrls", async () => {
    await setOwnerSurfaces("o", [
      { ...overlay("block"), urlMatch: { denyUrls: ["*://*.safe.com/*"] } },
    ])
    expect(await getSurfacesForUrl("https://app.safe.com/")).toHaveLength(0)
    expect(await getSurfacesForUrl("https://other.com/")).toHaveLength(1)
  })
})

describe("broadcast", () => {
  it("notifies open tabs with monocle-surfaces-changed on every mutation", async () => {
    // broadcastToAllTabs goes through callBrowserAPI -> chrome.tabs (callback
    // style); storage stays on fakeBrowser. Override chrome.tabs with a tab and
    // a sendMessage spy so we can assert the change broadcast actually fires.
    const sendMessage = vi.fn(
      (_tabId: number, _message: unknown, cb: () => void) => cb(),
    )
    vi.stubGlobal("chrome", {
      runtime: { id: "monocle-test" },
      tabs: {
        query: (_q: unknown, cb: (tabs: unknown[]) => void) => cb([{ id: 1 }]),
        sendMessage,
      },
    })

    await setOwnerSurfaces("focus-mode", [badge("b")])
    await upsertSurface("focus-mode", badge("c"))
    await removeSurface("focus-mode", "c")
    await clearOwnerSurfaces("focus-mode")

    // Each mutation broadcasts exactly once to the open tab.
    expect(sendMessage).toHaveBeenCalledTimes(4)
    expect(sendMessage).toHaveBeenCalledWith(
      1,
      { type: "monocle-surfaces-changed" },
      expect.any(Function),
    )
  })
})

describe("initSurfaces", () => {
  it("drops per-session (userscript:* and command:*) owners but keeps feature owners", async () => {
    await setOwnerSurfaces("focus-mode", [badge("f")])
    await upsertSurface("userscript:42", badge("u"))
    await upsertSurface("command:url-as-qr-code", badge("q"))

    await initSurfaces()

    const ids = (await getSurfacesForUrl("https://x.com")).map((s) => s.id)
    expect(ids).toEqual(["f"])
  })
})
