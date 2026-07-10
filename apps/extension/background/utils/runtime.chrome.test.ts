import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../shared/utils/browser", () => ({
  isFirefox: false,
}))

import { createCrossBrowserMessageHandler } from "./runtime"

beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle/",
    },
  })
})

describe("createCrossBrowserMessageHandler (Chrome)", () => {
  it("resolves a thrown handler error through sendResponse as { error }", async () => {
    const wrapped = createCrossBrowserMessageHandler(async () => {
      throw new Error("handler failed")
    })
    const response = new Promise<unknown>((resolve) => {
      expect(wrapped({ type: "monocle-commands-get" }, {}, resolve)).toBe(true)
    })

    await expect(response).resolves.toEqual({ error: "handler failed" })
  })

  it("passes a successful handler result through sendResponse", async () => {
    const wrapped = createCrossBrowserMessageHandler(async () => ({ ok: true }))
    const response = new Promise<unknown>((resolve) => {
      expect(wrapped({ type: "monocle-commands-get" }, {}, resolve)).toBe(true)
    })

    await expect(response).resolves.toEqual({ ok: true })
  })
})
