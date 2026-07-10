import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import {
  clearAllSettings,
  getAllSettings,
  updateCommandSettings,
} from "../commands/settings"
import { updateSettings } from "./settings"

beforeEach(async () => {
  fakeBrowser.reset()
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
  await clearAllSettings()
})

describe("updateSettings", () => {
  it("applies a UI patch without losing command settings", async () => {
    await updateCommandSettings("open-new-tab", {
      keybinding: "<cmd-t>",
      hidden: true,
    })

    await expect(
      updateSettings({
        type: "monocle-settings-update",
        theme: { mode: "nord" },
      }),
    ).resolves.toMatchObject({
      success: true,
      theme: { mode: "nord" },
    })

    await expect(getAllSettings()).resolves.toEqual({
      theme: { mode: "nord" },
      newTab: {},
      commands: {
        "open-new-tab": {
          keybinding: "<cmd-t>",
          hidden: true,
        },
      },
    })
  })

  it("deep-merges nested new-tab patches", async () => {
    await updateSettings({
      type: "monocle-settings-update",
      newTab: {
        backgroundCategories: ["nature"],
        clock: { show: true },
      },
    })

    await updateSettings({
      type: "monocle-settings-update",
      newTab: { clock: { show: false } },
    })

    await expect(getAllSettings()).resolves.toMatchObject({
      newTab: {
        backgroundCategories: ["nature"],
        clock: { show: false },
      },
    })
  })
})
