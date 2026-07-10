import { describe, expect, it, vi } from "vitest"
import type { ThunkApi } from "./index"
import { createMessageThunk } from "./messageThunk"

const run = async (
  sendMessage: ThunkApi["sendMessage"],
  fallbackError = "Fallback failure",
) => {
  const thunk = createMessageThunk<string, string, { value: string }>(
    "test/message",
    () => ({ type: "monocle-permissions-get" }),
    (response, suffix) => `${response.value}:${suffix}`,
    fallbackError,
  )
  return await thunk("arg")(vi.fn(), vi.fn(), { sendMessage })
}

describe("createMessageThunk", () => {
  it("maps successful responses", async () => {
    const action = await run(vi.fn().mockResolvedValue({ value: "ok" }))
    expect(action.type).toBe("test/message/fulfilled")
    expect(action.payload).toBe("ok:arg")
  })

  it("rejects handler error envelopes", async () => {
    const action = await run(
      vi.fn().mockResolvedValue({ error: "Handler failed" }),
    )
    expect(action.type).toBe("test/message/rejected")
    expect(action.payload).toBe("Handler failed")
  })

  it("uses the fallback for non-Error transport failures", async () => {
    const action = await run(vi.fn().mockRejectedValue("offline"))
    expect(action.type).toBe("test/message/rejected")
    expect(action.payload).toBe("Fallback failure")
  })
})
