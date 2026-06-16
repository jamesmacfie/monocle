import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"

// Mock the browser util barrel so tab/window orchestration is observable and we
// don't need a full chrome.* stub. Config storage still hits fakeBrowser.
const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  createWindow: vi.fn(),
  queryTabs: vi.fn(),
  updateTab: vi.fn(),
  removeTab: vi.fn(),
  getActiveTab: vi.fn(),
  getTabGroup: vi.fn(),
  groupTabs: vi.fn(),
  ungroupTabs: vi.fn(),
  queryTabGroups: vi.fn(),
  updateTabGroup: vi.fn(),
  sendSuccessToastToActiveTab: vi.fn(),
  sendErrorToastToActiveTab: vi.fn(),
}))

vi.mock("../../utils/browser", () => mocks)

import { tabGroupsFeature } from "./index"
import { tabGroupsNativeCommands } from "./nativeCommands"
import { captureCurrentWindow, restoreGroup } from "./operations"
import {
  addSavedGroup,
  deleteSavedGroup,
  getTabGroupsConfig,
  renameSavedGroup,
  toggleSavedTabPin,
} from "./storage"
import type { SavedGroup } from "./types"

const runAction = (actionId: string, payload?: Record<string, unknown>) =>
  tabGroupsFeature.settings?.handleAction?.(actionId, { payload } as any)

const makeGroup = (overrides: Partial<SavedGroup> = {}): SavedGroup => ({
  id: "g1",
  name: "Work",
  tabs: [
    { id: "t1", url: "https://a.test", title: "A", pinned: true },
    { id: "t2", url: "https://b.test", title: "B" },
  ],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
  fakeBrowser.reset()
  await fakeBrowser.storage.local.clear()
  mocks.createWindow.mockResolvedValue({ id: 99, tabs: [{ id: 991 }] })
  mocks.createTab.mockResolvedValue({})
  mocks.updateTab.mockResolvedValue({})
})

describe("tab-groups capture", () => {
  it("records each tab's pinned state and live ids", async () => {
    mocks.queryTabs.mockResolvedValueOnce([
      { id: 1, url: "https://a.test", title: "A", pinned: true },
      { id: 2, url: "https://b.test", title: "B", pinned: false },
      { id: 3, title: "no url" },
    ])

    const { group, capturedTabIds } = await captureCurrentWindow("Work", 1234)

    expect(group.name).toBe("Work")
    expect(group.tabs).toHaveLength(2) // tab without url is skipped
    expect(group.tabs[0]).toMatchObject({ url: "https://a.test", pinned: true })
    expect(group.tabs[1].pinned).toBeUndefined()
    expect(capturedTabIds).toEqual([1, 2])
  })

  it("records the Firefox container and mute state when present", async () => {
    mocks.queryTabs.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://a.test",
        cookieStoreId: "firefox-container-1",
        mutedInfo: { muted: true },
      },
      { id: 2, url: "https://b.test", mutedInfo: { muted: false } },
    ])

    const { group } = await captureCurrentWindow("Work", 1)

    expect(group.tabs[0]).toMatchObject({
      cookieStoreId: "firefox-container-1",
      muted: true,
    })
    // No container, not muted -> fields omitted (not false/empty string).
    expect(group.tabs[1].cookieStoreId).toBeUndefined()
    expect(group.tabs[1].muted).toBeUndefined()
  })
})

describe("tab-groups restore", () => {
  it("reopens tabs in the current window honoring pinned", async () => {
    await restoreGroup(makeGroup(), false)

    expect(mocks.createWindow).not.toHaveBeenCalled()
    expect(mocks.createTab).toHaveBeenCalledWith({
      url: "https://a.test",
      pinned: true,
      active: false,
    })
    expect(mocks.createTab).toHaveBeenCalledWith({
      url: "https://b.test",
      pinned: false,
      active: false,
    })
  })

  it("opens a new window and pins the seed tab when configured", async () => {
    await restoreGroup(makeGroup(), true)

    expect(mocks.createWindow).toHaveBeenCalledWith({ url: "https://a.test" })
    // First (pinned) tab seeds the window and is pinned afterwards.
    expect(mocks.updateTab).toHaveBeenCalledWith(991, { pinned: true })
    // Remaining tab is appended to the new window.
    expect(mocks.createTab).toHaveBeenCalledWith({
      windowId: 99,
      url: "https://b.test",
      pinned: false,
      active: false,
    })
  })

  it("reapplies mute state after the tab is created", async () => {
    mocks.createTab.mockResolvedValue({ id: 555 })
    const group = makeGroup({
      tabs: [{ id: "t1", url: "https://a.test", muted: true }],
    })

    await restoreGroup(group, false)

    expect(mocks.updateTab).toHaveBeenCalledWith(555, { muted: true })
  })

  it("does not pass a Firefox container id to Chrome's create call", async () => {
    // isFirefox is false in this (Chrome) test env, so the saved container is
    // ignored rather than passed to chrome.tabs.create (which would reject it).
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
    })
  })
})

describe("tab-groups storage", () => {
  it("adds, renames, toggles a pin, and deletes", async () => {
    await addSavedGroup(makeGroup())
    expect((await getTabGroupsConfig()).savedGroups).toHaveLength(1)

    await renameSavedGroup("g1", "Renamed", 2)
    expect((await getTabGroupsConfig()).savedGroups[0].name).toBe("Renamed")

    await toggleSavedTabPin("g1", "t2", 3)
    const tabs = (await getTabGroupsConfig()).savedGroups[0].tabs
    expect(tabs.find((t) => t.id === "t2")?.pinned).toBe(true)

    await deleteSavedGroup("g1")
    expect((await getTabGroupsConfig()).savedGroups).toHaveLength(0)
  })
})

describe("tab-groups handleAction", () => {
  beforeEach(async () => {
    await addSavedGroup(makeGroup())
  })

  it("restore-group reopens the group's tabs", async () => {
    await runAction("restore-group", { itemId: "g1" })
    expect(mocks.createTab).toHaveBeenCalledWith({
      url: "https://a.test",
      pinned: true,
      active: false,
    })
  })

  it("rename-group renames by itemId + value", async () => {
    await runAction("rename-group", { itemId: "g1", value: "New Name" })
    expect((await getTabGroupsConfig()).savedGroups[0].name).toBe("New Name")
  })

  it("toggle-pin flips a tab's pinned flag", async () => {
    await runAction("toggle-pin", { itemId: "g1", childId: "t2" })
    const tabs = (await getTabGroupsConfig()).savedGroups[0].tabs
    expect(tabs.find((t) => t.id === "t2")?.pinned).toBe(true)
  })

  it("delete-group removes the group", async () => {
    await runAction("delete-group", { itemId: "g1" })
    expect((await getTabGroupsConfig()).savedGroups).toHaveLength(0)
  })
})

describe("tab-groups lists projection", () => {
  it("projects groups into rows with per-tab children", async () => {
    const config = await getTabGroupsConfig()
    config.savedGroups = [makeGroup()]
    const lists = await tabGroupsFeature.settings?.lists?.(config)
    const rows = lists?.savedGroups
    expect(rows?.[0]).toMatchObject({
      id: "g1",
      label: "Work",
      sublabel: "2 tabs",
    })
    expect(rows?.[0].children?.[0]).toMatchObject({
      id: "t1",
      sublabel: "Pinned",
    })
    expect(rows?.[0].children?.[1].sublabel).toBeUndefined()
  })
})

describe("tab-groups native commands", () => {
  it("are all Chrome-only and require tabGroups", () => {
    for (const command of tabGroupsNativeCommands()) {
      expect(command.supportedBrowsers).toEqual(["chrome"])
      expect(command.permissions).toContain("tabGroups")
    }
  })
})
