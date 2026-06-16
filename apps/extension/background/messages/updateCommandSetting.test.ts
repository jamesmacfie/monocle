import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import {
  clearAllSettings,
  getCommandSettings,
  updateCommandSettings,
} from "../commands/settings"
import { addSnippet } from "../commands/snippets"
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
      type: "monocle-command-setting-update",
      id: "uuidv4",
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
      type: "monocle-command-setting-update",
      id: "uuidv4",
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

  it("sets keybindings for hidden commands through the settings catalog fallback", async () => {
    await updateCommandSettings("uuidv4", {
      hidden: true,
    })

    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: "uuidv4",
      setting: "keybinding",
      value: "<cmd-shift-u>",
      context: normalContext,
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      hidden: true,
      keybinding: "<cmd-shift-u>",
    })
  })

  it("sets keybindings for new-tab catalog commands from the options page context", async () => {
    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: "toggle-clock-visibility",
      setting: "keybinding",
      value: "<cmd-alt-c>",
      context: {
        url: "chrome-extension://monocle-test/options.html#/commands",
        title: "Monocle Settings",
        modifierKey: null,
      },
    })

    await expect(
      getCommandSettings("toggle-clock-visibility"),
    ).resolves.toEqual({
      keybinding: "<cmd-alt-c>",
    })
  })

  it("enforces snippet keybinding requirements on persist", async () => {
    const snippet = await addSnippet({ name: "Greeting", body: "Hello" })
    const commandId = `snippet-${snippet.id}`

    // Plain keys and shift-only strokes never reach the page while an
    // editable element is focused, so the requirement gate rejects them.
    await expect(
      updateCommandSetting({
        type: "monocle-command-setting-update",
        id: commandId,
        setting: "keybinding",
        value: "g",
        context: normalContext,
      }),
    ).rejects.toThrow("Keybinding not allowed")

    await expect(
      updateCommandSetting({
        type: "monocle-command-setting-update",
        id: commandId,
        setting: "keybinding",
        value: "<shift-7>",
        context: normalContext,
      }),
    ).rejects.toThrow("Keybinding not allowed")

    // Modifier combos persist, and clearing still works.
    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: commandId,
      setting: "keybinding",
      value: "<cmd-shift-7>",
      context: normalContext,
    })
    await expect(getCommandSettings(commandId)).resolves.toEqual({
      keybinding: "<cmd-shift-7>",
    })

    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: commandId,
      setting: "keybinding",
      value: "",
      context: normalContext,
    })
    await expect(getCommandSettings(commandId)).resolves.toBeUndefined()
  })

  it("validates URL rules and preserves keybindings during URL-rule updates", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: "uuidv4",
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
        type: "monocle-command-setting-update",
        id: "uuidv4",
        setting: "urlRules",
        value: {
          allowUrls: ["ftp://example.com/*"],
        },
        context: normalContext,
      }),
    ).rejects.toThrow("Invalid pattern")
  })

  it("persists hidden true, prunes hidden false, and preserves sibling settings", async () => {
    await updateCommandSettings("uuidv4", {
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: "uuidv4",
      setting: "hidden",
      value: true,
      context: normalContext,
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      hidden: true,
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await updateCommandSetting({
      type: "monocle-command-setting-update",
      id: "uuidv4",
      setting: "hidden",
      value: false,
      context: normalContext,
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      keybinding: "<cmd-shift-u>",
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })
  })
})
