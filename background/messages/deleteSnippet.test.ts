import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import {
  clearAllSettings,
  getCommandSettings,
  updateCommandSettings,
} from "../commands/settings"
import { addSnippet, getSnippets } from "../commands/snippets"
import { deleteSnippet } from "./deleteSnippet"

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
})

describe("deleteSnippet message handler", () => {
  it("removes the snippet's dangling command settings on delete", async () => {
    const snippet = await addSnippet({ name: "Greeting", body: "Hello" })
    const commandId = `snippet-${snippet.id}`
    await updateCommandSettings(commandId, { keybinding: "<cmd-alt-1>" })

    const response = await deleteSnippet({
      type: "delete-snippet",
      id: snippet.id,
    })

    expect(response).toEqual({ deleted: true })
    await expect(getSnippets()).resolves.toEqual([])
    await expect(getCommandSettings(commandId)).resolves.toBeUndefined()
  })

  it("leaves settings untouched when the snippet id is unknown", async () => {
    await updateCommandSettings("snippet-other", {
      keybinding: "<cmd-alt-2>",
    })

    const response = await deleteSnippet({
      type: "delete-snippet",
      id: "missing",
    })

    expect(response).toEqual({ deleted: false })
    await expect(getCommandSettings("snippet-other")).resolves.toEqual({
      keybinding: "<cmd-alt-2>",
    })
  })
})
