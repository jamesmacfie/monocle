import { beforeEach, describe, expect, it, vi } from "vitest"

// Container restore is gated on isFirefox; force it on so the saved
// cookieStoreId is passed through to the create calls. Chrome-mode behavior
// lives in tabGroups.test.ts (real isFirefox = false).
vi.mock("../../../shared/utils/browser", () => ({
  isFirefox: true,
  isChrome: false,
}))

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  createWindow: vi.fn(),
  queryTabs: vi.fn(),
  updateTab: vi.fn(),
  removeTab: vi.fn(),
}))

vi.mock("../../utils/browser", () => mocks)

import { restoreGroup } from "./operations"
import type { SavedGroup } from "./types"

const makeGroup = (overrides: Partial<SavedGroup> = {}): SavedGroup => ({
  id: "g1",
  name: "Work",
  tabs: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createWindow.mockResolvedValue({ id: 99, tabs: [{ id: 991 }] })
  mocks.createTab.mockResolvedValue({ id: 555 })
  mocks.updateTab.mockResolvedValue({})
})

describe("tab-groups restore on Firefox", () => {
  it("passes the saved container id to the current-window create call", async () => {
    const group = makeGroup({
      tabs: [
        {
          id: "t1",
          url: "https://a.test",
          cookieStoreId: "firefox-container-1",
        },
      ],
    })

    await restoreGroup(group, false)

    expect(mocks.createTab).toHaveBeenCalledWith({
      url: "https://a.test",
      pinned: false,
      active: false,
      cookieStoreId: "firefox-container-1",
    })
  })

  it("seeds a new window in the saved container", async () => {
    const group = makeGroup({
      tabs: [
        {
          id: "t1",
          url: "https://a.test",
          cookieStoreId: "firefox-container-1",
        },
        {
          id: "t2",
          url: "https://b.test",
          cookieStoreId: "firefox-container-2",
        },
      ],
    })

    await restoreGroup(group, true)

    expect(mocks.createWindow).toHaveBeenCalledWith({
      url: "https://a.test",
      cookieStoreId: "firefox-container-1",
    })
    expect(mocks.createTab).toHaveBeenCalledWith({
      windowId: 99,
      url: "https://b.test",
      pinned: false,
      active: false,
      cookieStoreId: "firefox-container-2",
    })
  })
})
