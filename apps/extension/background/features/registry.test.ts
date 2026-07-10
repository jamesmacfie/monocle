import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { GroupCommandNode } from "../../shared/types"
import {
  getFeatureConfig,
  getStoredFeatureConfig,
  setFeatureConfig,
  updateFeatureConfig,
} from "./config"
import {
  getFeatureById,
  getFeatureCommands,
  getFeatureDescriptors,
} from "./index"
import {
  clearFeatureState,
  getFeatureState,
  setFeatureState,
  updateFeatureState,
} from "./state"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await fakeBrowser.storage.local.clear()
})

describe("feature config store", () => {
  it("merges persisted config over defaults", async () => {
    await setFeatureConfig("demo", { a: 1 })
    await expect(getFeatureConfig("demo", { a: 0, b: 2 })).resolves.toEqual({
      a: 1,
      b: 2,
    })
  })

  it("replaces config wholesale on write (no sibling merge)", async () => {
    await setFeatureConfig("demo", { a: 1, b: 9 })
    await setFeatureConfig("demo", { a: 2 })
    await expect(getStoredFeatureConfig("demo")).resolves.toEqual({ a: 2 })
  })

  it("serializes concurrent per-feature config updates", async () => {
    await Promise.all([
      updateFeatureConfig("demo", { items: [] as string[] }, (config) => ({
        items: [...config.items, "a"],
      })),
      updateFeatureConfig("demo", { items: [] as string[] }, (config) => ({
        items: [...config.items, "b"],
      })),
    ])

    await expect(
      getFeatureConfig("demo", { items: [] as string[] }),
    ).resolves.toEqual({
      items: expect.arrayContaining(["a", "b"]),
    })
  })
})

describe("feature state store", () => {
  it("sets, gets, and clears runtime state", async () => {
    await setFeatureState("demo", { n: 1 })
    await expect(getFeatureState("demo")).resolves.toEqual({ n: 1 })
    await clearFeatureState("demo")
    await expect(getFeatureState("demo")).resolves.toBeUndefined()
  })

  it("serializes concurrent per-feature state updates", async () => {
    await Promise.all([
      updateFeatureState<{ items: string[] }>("demo", (state) => ({
        items: [...(state?.items ?? []), "a"],
      })),
      updateFeatureState<{ items: string[] }>("demo", (state) => ({
        items: [...(state?.items ?? []), "b"],
      })),
    ])

    await expect(getFeatureState("demo")).resolves.toEqual({
      items: expect.arrayContaining(["a", "b"]),
    })
  })
})

describe("feature registry", () => {
  it("registers the focus-mode feature", () => {
    expect(getFeatureById("focus-mode")).toBeDefined()
    expect(getFeatureById("nope")).toBeUndefined()
  })

  it("contributes the Focus Mode command group with a Configure child", async () => {
    const commands = getFeatureCommands()
    const group = commands.find((command) => command.id === "focus-mode") as
      | GroupCommandNode
      | undefined
    expect(group?.type).toBe("group")

    const children = await group?.children({
      url: "https://example.com",
      title: "",
      modifierKey: null,
    })
    const ids = (children ?? []).map((child) => child.id)
    expect(ids).toContain("feature-focus-mode-configure")
    // Inactive session => start commands are shown.
    expect(ids).toContain("focus-start")
  })

  it("projects a data-only descriptor with merged config", async () => {
    const descriptors = await getFeatureDescriptors()
    const focus = descriptors.find((feature) => feature.id === "focus-mode")
    expect(focus?.hasSettings).toBe(true)
    expect(focus?.schema?.actions?.map((action) => action.id)).toEqual([
      "start",
      "stop",
    ])
    expect(focus?.config).toMatchObject({
      blockedUrlPatterns: [],
      defaultDurationMinutes: 25,
    })
  })

  it("registers tab-groups and projects a (record-list) lists key", async () => {
    expect(getFeatureById("tab-groups")).toBeDefined()
    const descriptors = await getFeatureDescriptors()
    const tabGroups = descriptors.find((feature) => feature.id === "tab-groups")
    expect(tabGroups?.hasSettings).toBe(true)
    // The lists projection is always present (empty array when no saved groups).
    expect(tabGroups?.lists?.savedGroups).toEqual([])
  })
})
