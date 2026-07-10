import { beforeEach, describe, expect, it, vi } from "vitest"

// Force the Firefox code path: isFirefox is evaluated at import time from the
// browser env, so mock the module to pin it true for this file.
vi.mock("../../shared/utils/browser", () => ({
  isFirefox: true,
}))

import { createCrossBrowserMessageHandler } from "./runtime"

beforeEach(() => {
  vi.stubGlobal("browser", {
    runtime: { id: "monocle-test", getURL: () => "moz-extension://monocle/" },
  })
})

describe("createCrossBrowserMessageHandler (Firefox)", () => {
  it("resolves a thrown handler error to { error } instead of rejecting", async () => {
    const wrapped = createCrossBrowserMessageHandler(async () => {
      throw new Error('Invalid pattern "ftp://x"')
    })

    // Firefox: the wrapper returns the promise directly to the runtime; it must
    // resolve to { error } so callers can read response.error uniformly.
    const result = await (wrapped(
      { type: "monocle-command-setting-update" },
      {},
      () => {},
    ) as Promise<{ error: string }>)

    expect(result).toEqual({ error: 'Invalid pattern "ftp://x"' })
  })

  it("passes a successful handler result straight through", async () => {
    const wrapped = createCrossBrowserMessageHandler(async () => ({ ok: true }))

    const result = await (wrapped(
      { type: "monocle-commands-get" },
      {},
      () => {},
    ) as Promise<{ ok: boolean }>)

    expect(result).toEqual({ ok: true })
  })
})
