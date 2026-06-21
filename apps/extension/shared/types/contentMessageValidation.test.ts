import { describe, expect, it } from "vitest"
import {
  ContentMessageSchema,
  validateContentMessage,
} from "./contentMessageValidation"

const context = {
  url: "https://example.com/",
  title: "Example",
  modifierKey: null,
}

describe("ContentMessageSchema", () => {
  it("accepts a valid execute-workflow-content message", () => {
    const result = ContentMessageSchema.safeParse({
      type: "monocle-workflow-content-execute",
      context,
      workflow: {
        version: "1.0",
        steps: [{ op: "wait", for: { timeMs: 1 } }],
      },
    })

    expect(result.success).toBe(true)
  })

  it("rejects malformed execute-workflow-content messages", () => {
    const result = ContentMessageSchema.safeParse({
      type: "monocle-workflow-content-execute",
      context,
      workflow: {
        version: "1.0",
        steps: [{ op: "not-real" }],
      },
    })

    expect(result.success).toBe(false)
  })

  it("rejects malformed insert-text messages before listeners act", () => {
    expect(
      validateContentMessage({ type: "monocle-text-insert", text: "" }),
    ).toBeNull()
  })

  it("accepts the no-payload copy-page-markdown message", () => {
    expect(
      validateContentMessage({ type: "monocle-copy-page-markdown" })?.type,
    ).toBe("monocle-copy-page-markdown")
    expect(
      validateContentMessage({ type: "monocle-copy-page-markdown", x: 1 }),
    ).toBeNull()
  })

  it("accepts site SDK invoke requests with validated context", () => {
    const message = validateContentMessage({
      type: "monocle-site-sdk-invoke",
      request: {
        type: "execute",
        callbackId: "cb-1",
        commandId: "command-1",
        context,
        values: {},
      },
    })

    expect(message?.type).toBe("monocle-site-sdk-invoke")
  })

  it("requires one valid scroll message shape", () => {
    expect(
      validateContentMessage({ type: "monocle-scroll", direction: "top" }),
    ).not.toBeNull()
    expect(
      validateContentMessage({
        type: "monocle-scroll",
        direction: "top",
        axis: "y",
        edge: "end",
      }),
    ).toBeNull()
  })
})
