import { describe, expect, it } from "vitest"
import { ContentBlockSchema, validateContentBlocks } from "./contentValidation"

describe("ContentBlockSchema", () => {
  it("accepts each block variant", () => {
    expect(
      ContentBlockSchema.safeParse({
        type: "keyValue",
        rows: [{ label: "1 + 89", value: "90" }],
      }).success,
    ).toBe(true)
    expect(
      ContentBlockSchema.safeParse({ type: "code", text: "const x = 1" })
        .success,
    ).toBe(true)
    expect(
      ContentBlockSchema.safeParse({ type: "markdown", text: "**hi**" })
        .success,
    ).toBe(true)
    expect(
      ContentBlockSchema.safeParse({ type: "image", dataUrl: "data:," })
        .success,
    ).toBe(true)
  })

  it("rejects unknown types and malformed blocks", () => {
    expect(
      ContentBlockSchema.safeParse({ type: "html", text: "x" }).success,
    ).toBe(false)
    expect(ContentBlockSchema.safeParse({ type: "keyValue" }).success).toBe(
      false,
    )
    expect(
      ContentBlockSchema.safeParse({
        type: "keyValue",
        rows: [{ label: "no value" }],
      }).success,
    ).toBe(false)
  })
})

describe("validateContentBlocks", () => {
  it("returns the validated array for a valid payload", () => {
    const blocks = validateContentBlocks([
      { type: "keyValue", rows: [{ label: "a", value: "b" }] },
    ])
    expect(blocks).toEqual([
      { type: "keyValue", rows: [{ label: "a", value: "b" }] },
    ])
  })

  it("returns null for an invalid payload (fail-quiet)", () => {
    expect(validateContentBlocks([{ type: "nope" }])).toBeNull()
    expect(validateContentBlocks("not an array")).toBeNull()
  })
})
