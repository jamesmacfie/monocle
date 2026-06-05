import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import {
  clearAllSettings,
  getCommandSettings,
  updateCommandSettings,
} from "../commands/settings"
import { updateCommandSetting } from "./updateCommandSetting"

const normalContext: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

const installChromeStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    notifications: {
      create: vi.fn((_id: string, _options: object, callback?: Function) => {
        callback?.("notification-id")
        return Promise.resolve("notification-id")
      }),
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
    tabs: {
      query: vi.fn((_queryInfo: object, callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
      }),
    },
  })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installChromeStubs()
  await clearAllSettings()
})

describe("updateCommandSetting message handler", () => {
  it("persists canonical keybindings and preserves URL rules", async () => {
    await updateCommandSettings("uuidv4", {
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandSetting({
      type: "update-command-setting",
      commandId: "uuidv4",
      setting: "keybinding",
      value: "<cmd-shift-u>",
      context: normalContext,
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("removes only keybinding settings for empty keybinding updates", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandSetting({
      type: "update-command-setting",
      commandId: "uuidv4",
      setting: "keybinding",
      value: "",
      context: normalContext,
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })

  it("validates URL rules and preserves keybindings during URL-rule updates", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandSetting({
      type: "update-command-setting",
      commandId: "uuidv4",
      setting: "urlRules",
      value: {
        allowUrls: ["*://allowed.example.com/*"],
      },
      context: normalContext,
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      keybinding: "<cmd-shift-u>",
      urlRules: {
        allowUrls: ["*://allowed.example.com/*"],
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await expect(
      updateCommandSetting({
        type: "update-command-setting",
        commandId: "uuidv4",
        setting: "urlRules",
        value: {
          allowUrls: ["ftp://example.com/*"],
        },
        context: normalContext,
      }),
    ).rejects.toThrow("Invalid pattern")
  })
})
