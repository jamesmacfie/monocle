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
    ).resolves.toEqual({ success: true, updated: 2 })

    await expect(getCommandSettings("open-new-tab")).resolves.toEqual({
      keybinding: "t",
    })
    await expect(getCommandSettings("reload-current-tab")).resolves.toEqual({
      keybinding: "r",
    })
    expect(showToast).not.toHaveBeenCalled()
  })
})
