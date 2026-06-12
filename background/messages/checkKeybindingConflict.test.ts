import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser } from "../../shared/types"
import { clearAllSettings } from "../commands/settings"
import { addSnippet } from "../commands/snippets"
import { invalidateKeybindingEntriesCache } from "../keybindings/source"
import { checkKeybindingConflict } from "./checkKeybindingConflict"

const normalContext: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

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

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await clearAllSettings()
  invalidateKeybindingEntriesCache()
})

describe("checkKeybindingConflict requirement violations", () => {
  it("reports a violation for plain keys on snippet commands", async () => {
    const snippet = await addSnippet({ name: "Greeting", body: "Hello" })

    const response = await checkKeybindingConflict({
      type: "check-keybinding-conflict",
      keybinding: "g",
      excludeCommandId: `snippet-${snippet.id}`,
      context: normalContext,
    })

    expect(response.hasConflict).toBe(false)
    expect(response.requirementViolation).toEqual({
      code: "missing-non-shift-modifier",
      message: expect.stringContaining("⌘"),
    })
  })

  it("omits the violation for modifier combos on snippet commands", async () => {
    const snippet = await addSnippet({ name: "Greeting", body: "Hello" })

    const response = await checkKeybindingConflict({
      type: "check-keybinding-conflict",
      keybinding: "<cmd-shift-7>",
      excludeCommandId: `snippet-${snippet.id}`,
      context: normalContext,
    })

    expect(response.requirementViolation).toBeUndefined()
  })

  it("omits the violation for commands without requirements", async () => {
    const response = await checkKeybindingConflict({
      type: "check-keybinding-conflict",
      keybinding: "g",
      excludeCommandId: "uuidv4",
      context: normalContext,
    })

    expect(response.requirementViolation).toBeUndefined()
  })
})
