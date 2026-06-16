import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"

// queryContainers short-circuits to [] unless isFirefox; force it on.
vi.mock("../../shared/utils/browser", () => ({
  isFirefox: true,
  isChrome: false,
}))

import { invalidateContainerCache, queryContainers } from "./firefox"

describe("queryContainers caching", () => {
  let querySpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    invalidateContainerCache()
    querySpy = vi.fn(async () => [
      { cookieStoreId: "firefox-container-1", name: "Work" },
    ])
    // Code reads the WXT-imported `browser` (fakeBrowser), so patch it directly.
    ;(fakeBrowser as any).contextualIdentities = { query: querySpy }
  })

  afterEach(() => {
    invalidateContainerCache()
    ;(fakeBrowser as any).contextualIdentities = undefined
  })

  it("coalesces a burst of empty queries into one underlying call", async () => {
    const [a, b] = await Promise.all([queryContainers({}), queryContainers({})])
    const c = await queryContainers({})

    expect(querySpy).toHaveBeenCalledTimes(1)
    expect(a).toBe(c)
    expect(b).toEqual([{ cookieStoreId: "firefox-container-1", name: "Work" }])
  })

  it("re-queries after the cache is invalidated", async () => {
    await queryContainers({})
    invalidateContainerCache()
    await queryContainers({})

    expect(querySpy).toHaveBeenCalledTimes(2)
  })

  it("does not cache parameterised queries", async () => {
    await queryContainers({ name: "Work" })
    await queryContainers({ name: "Work" })

    expect(querySpy).toHaveBeenCalledTimes(2)
  })
})
