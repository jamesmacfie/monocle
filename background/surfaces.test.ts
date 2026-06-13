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

describe("initSurfaces", () => {
  it("drops per-session (userscript:*) owners but keeps feature owners", async () => {
    await setOwnerSurfaces("focus-mode", [badge("f")])
    await upsertSurface("userscript:42", badge("u"))

    await initSurfaces()

    const ids = (await getSurfacesForUrl("https://x.com")).map((s) => s.id)
    expect(ids).toEqual(["f"])
  })
})
