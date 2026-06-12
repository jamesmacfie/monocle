import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import {
  addSnippet,
  deleteSnippet,
  getSnippet,
  getSnippets,
  updateSnippet,
} from "./snippets"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
    },
  })
}

beforeEach(() => {
  fakeBrowser.reset()
  installBrowserStubs()
})

describe("snippets storage", () => {
  it("starts empty", async () => {
    await expect(getSnippets()).resolves.toEqual([])
  })

  it("adds, reads, updates, and deletes a snippet", async () => {
    const created = await addSnippet({
      name: "Greeting",
      body: "Hello there,\n\nThanks for reaching out.",
    })

    expect(created.id).toBeTruthy()
    expect(created.name).toBe("Greeting")
    expect(created.createdAt).toBe(created.updatedAt)

    await expect(getSnippet(created.id)).resolves.toMatchObject({
      name: "Greeting",
    })

    const updated = await updateSnippet(created.id, { name: "Hello" })
    expect(updated?.name).toBe("Hello")
    // Body untouched by a name-only update.
    expect(updated?.body).toBe(created.body)
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)

    await expect(deleteSnippet(created.id)).resolves.toBe(true)
    await expect(getSnippets()).resolves.toEqual([])
  })

  it("returns undefined/false for unknown snippet ids", async () => {
    await expect(updateSnippet("missing", { name: "x" })).resolves.toBe(
      undefined,
    )
    await expect(deleteSnippet("missing")).resolves.toBe(false)
  })

  it("keeps both snippets when two adds run concurrently", async () => {
    // Without the storage lock both adds read the same empty list and the
    // second save drops the first snippet.
    await Promise.all([
      addSnippet({ name: "a", body: "body a" }),
      addSnippet({ name: "b", body: "body b" }),
    ])

    const snippets = await getSnippets()
    expect(snippets.map((snippet) => snippet.name).sort()).toEqual(["a", "b"])
  })
})
