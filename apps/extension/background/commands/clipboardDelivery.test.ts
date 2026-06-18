// Architecture: background tests. The delivery seam
// (background/commands/clipboardDelivery.ts): clipboard mode writes to the
// active tab; return mode (bridge) suppresses the write so the value flows back
// to the caller instead; the mode is restored after runWithDelivery.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../utils/browser", () => ({ sendTabMessage: vi.fn(async () => {}) }))

import { sendTabMessage } from "../utils/browser"
import { deliverClipboard, runWithDelivery } from "./clipboardDelivery"

const mockSend = vi.mocked(sendTabMessage)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("clipboard delivery", () => {
  it("writes to the active tab in the default (clipboard) mode", async () => {
    await deliverClipboard(1, "value", "Copied")
    expect(mockSend).toHaveBeenCalledWith(1, {
      type: "monocle-clipboard-write",
      message: "value",
    })
    expect(mockSend).toHaveBeenCalledWith(1, {
      type: "monocle-toast",
      level: "success",
      message: "Copied",
    })
  })

  it("suppresses the write in return mode (bridge path)", async () => {
    await runWithDelivery("return", () =>
      deliverClipboard(1, "value", "Copied"),
    )
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("restores the previous mode after runWithDelivery", async () => {
    await runWithDelivery("return", async () => {})
    await deliverClipboard(1, "value", "Copied")
    expect(mockSend).toHaveBeenCalled()
  })

  it("returns the wrapped function's value", async () => {
    const result = await runWithDelivery("return", async () => ({ value: "x" }))
    expect(result).toEqual({ value: "x" })
  })
})
