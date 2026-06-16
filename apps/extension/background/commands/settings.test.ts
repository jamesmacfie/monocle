import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Settings } from "../../shared/types"
import {
  clearAllSettings,
  getAllSettings,
  getCommandSettings,
  getNewTabClockSettings,
  mergeCommandSettings,
  removeCommandSetting,
  updateCommandSettings,
  updateCommandUrlRules,
  updateNewTabClockSettings,
  updateNewTabSettings,
} from "./settings"

const STORAGE_KEY = "monocle-settings"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
    },
  })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await clearAllSettings()
})

describe("settings storage compatibility", () => {
  it("loads default settings from empty storage", async () => {
    await expect(getAllSettings()).resolves.toEqual({
      theme: {},
      newTab: {},
      commands: {},
    })
  })

  it("preserves sibling command settings during nested URL-rule updates", async () => {
    await updateCommandSettings("open-new-tab", {
      keybinding: "<cmd-t>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandUrlRules("open-new-tab", {
      allowUrls: ["*://allowed.example.com/*"],
    })

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "<cmd-t>",
      urlRules: {
        allowUrls: ["*://allowed.example.com/*"],
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("removes only the requested command setting field", async () => {
    await updateCommandSettings("open-new-tab", {
      keybinding: "<cmd-t>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await removeCommandSetting("open-new-tab", "keybinding")

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("preserves old command settings that do not yet have nested URL rules", async () => {
    await fakeBrowser.storage.local.set({
      [STORAGE_KEY]: {
        commands: {
          "open-new-tab": {
            keybinding: "<cmd-t>",
          },
        },
      } satisfies Settings,
    })

    await updateCommandUrlRules("open-new-tab", {
      denyUrls: ["*://blocked.example.com/*"],
    })

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "<cmd-t>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("persists clock visibility while preserving sibling new-tab settings", async () => {
    await updateNewTabSettings({
      backgroundCategories: ["nature", "architecture"],
      clock: {
        show: true,
      },
      greeting: {
        show: true,
      },
    })

    await updateNewTabClockSettings({
      show: false,
    })

    await expect(getNewTabClockSettings()).resolves.toEqual({
      show: false,
    })
    await expect(getAllSettings()).resolves.toEqual({
      theme: {},
      commands: {},
      newTab: {
        backgroundCategories: ["nature", "architecture"],
        clock: {
          show: false,
        },
        greeting: {
          show: true,
        },
      },
    })
  })
})

describe("command settings merge model", () => {
  it("merges URL rules one level deeper than other command settings", () => {
    expect(
      mergeCommandSettings(
        {
          keybinding: "<cmd-t>",
          urlRules: {
            allowUrls: ["*://allowed.example.com/*"],
            denyUrls: ["*://blocked.example.com/*"],
          },
        },
        {
          urlRules: {
            allowUrls: ["*://new.example.com/*"],
          },
        },
      ),
    ).toEqual({
      keybinding: "<cmd-t>",
      urlRules: {
        allowUrls: ["*://new.example.com/*"],
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("removes nested URL-rule lists without removing sibling command settings", () => {
    expect(
      mergeCommandSettings(
        {
          keybinding: "<cmd-t>",
          urlRules: {
            allowUrls: ["*://allowed.example.com/*"],
            denyUrls: ["*://blocked.example.com/*"],
          },
        },
        {
          urlRules: {
            allowUrls: undefined,
          },
        },
      ),
    ).toEqual({
      keybinding: "<cmd-t>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("persists true hidden settings and prunes false hidden settings", () => {
    expect(
      mergeCommandSettings(
        {
          keybinding: "<cmd-t>",
          urlRules: {
            denyUrls: ["*://blocked.example.com/*"],
          },
        },
        {
          hidden: true,
        },
      ),
    ).toEqual({
      keybinding: "<cmd-t>",
      hidden: true,
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    expect(
      mergeCommandSettings(
        {
          keybinding: "<cmd-t>",
          hidden: true,
          urlRules: {
            denyUrls: ["*://blocked.example.com/*"],
          },
        },
        {
          hidden: false,
        },
      ),
    ).toEqual({
      keybinding: "<cmd-t>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })
})

describe("concurrent write serialization", () => {
  it("keeps both updates when two commands are updated concurrently", async () => {
    // Without the storage lock both calls load the same snapshot before
    // either saves, and the second save silently drops the first update.
    await Promise.all([
      updateCommandSettings("command-a", { keybinding: "<cmd-1>" }),
      updateCommandSettings("command-b", { keybinding: "<cmd-2>" }),
    ])

    await expect(getCommandSettings("command-a")).resolves.toEqual({
      keybinding: "<cmd-1>",
    })
    await expect(getCommandSettings("command-b")).resolves.toEqual({
      keybinding: "<cmd-2>",
    })
  })

  it("keeps interleaved command and newTab updates", async () => {
    await Promise.all([
      updateCommandSettings("command-a", { hidden: true }),
      updateNewTabSettings({ clock: { show: true } } as never),
    ])

    await expect(getCommandSettings("command-a")).resolves.toEqual({
      hidden: true,
    })
    await expect(getNewTabClockSettings()).resolves.toEqual({ show: true })
  })
})
