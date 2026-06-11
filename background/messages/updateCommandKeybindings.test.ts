import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { clearAllSettings, getCommandSettings } from "../commands/settings"
import { handleMessage } from "."
import { showToast } from "./showToast"

vi.mock("./showToast", () => ({
  showToast: vi.fn(async () => ({ success: true })),
}))

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
  })
}

describe("update-command-keybindings", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    installBrowserStubs()
    vi.mocked(showToast).mockClear()
    await clearAllSettings()
  })

  it("updates multiple keybindings in one message without showing toasts", async () => {
    await expect(
      handleMessage({
        type: "update-command-keybindings",
        updates: [
          {
            commandId: "open-new-tab",
            keybinding: "t",
          },
          {
            commandId: "reload-current-tab",
            keybinding: "r",
          },
        ],
      }),
    ).resolves.toEqual({ success: true, updated: 2, conflicts: [] })

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "t",
    })
    await expect(getCommandSettings("reload-current-tab")).resolves.toEqual({
      keybinding: "r",
    })
    expect(showToast).not.toHaveBeenCalled()
  })

  it("skips and reports a keybinding already held by another command", async () => {
    await handleMessage({
      type: "update-command-keybindings",
      updates: [{ commandId: "open-new-tab", keybinding: "t" }],
    })

    const response = await handleMessage({
      type: "update-command-keybindings",
      updates: [{ commandId: "reload-current-tab", keybinding: "t" }],
    })

    expect(response).toEqual({
      success: true,
      updated: 0,
      conflicts: [
        {
          commandId: "reload-current-tab",
          keybinding: "t",
          conflictingCommand: expect.objectContaining({ id: "open-new-tab" }),
        },
      ],
    })
    await expect(
      getCommandSettings("reload-current-tab"),
    ).resolves.toBeUndefined()
    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "t",
    })
  })

  it("reports intra-batch conflicts; the first claimant wins", async () => {
    const response = await handleMessage({
      type: "update-command-keybindings",
      updates: [
        { commandId: "open-new-tab", keybinding: "x" },
        { commandId: "reload-current-tab", keybinding: "x" },
      ],
    })

    expect(response).toEqual({
      success: true,
      updated: 1,
      conflicts: [
        {
          commandId: "reload-current-tab",
          keybinding: "x",
          conflictingCommand: expect.objectContaining({ id: "open-new-tab" }),
        },
      ],
    })
    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "x",
    })
    await expect(
      getCommandSettings("reload-current-tab"),
    ).resolves.toBeUndefined()
  })

  it("does not report a conflict when a command keeps or trades its own key", async () => {
    await handleMessage({
      type: "update-command-keybindings",
      updates: [{ commandId: "open-new-tab", keybinding: "t" }],
    })

    // open-new-tab moves off "t" in the same batch that hands "t" to
    // reload-current-tab: no conflict, both persist.
    const response = await handleMessage({
      type: "update-command-keybindings",
      updates: [
        { commandId: "open-new-tab", keybinding: "y" },
        { commandId: "reload-current-tab", keybinding: "t" },
      ],
    })

    expect(response).toEqual({ success: true, updated: 2, conflicts: [] })
    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "y",
    })
    await expect(getCommandSettings("reload-current-tab")).resolves.toEqual({
      keybinding: "t",
    })
  })

  it("clears keybindings without conflict checks and counts them as updated", async () => {
    await handleMessage({
      type: "update-command-keybindings",
      updates: [{ commandId: "open-new-tab", keybinding: "t" }],
    })

    const response = await handleMessage({
      type: "update-command-keybindings",
      updates: [{ commandId: "open-new-tab", keybinding: null }],
    })

    expect(response).toEqual({ success: true, updated: 1, conflicts: [] })
    await expect(getCommandSettings("open-new-tab")).resolves.toBeUndefined()
  })
})
