import { describe, expect, it } from "vitest"
import { toggleId } from "./updatingIds"

describe("toggleId", () => {
  it("adds idempotently and removes safely", () => {
    expect(toggleId([], "a", true)).toEqual(["a"])
    expect(toggleId(["a"], "a", true)).toEqual(["a"])
    expect(toggleId(["a", "b"], "a", false)).toEqual(["b"])
    expect(toggleId(["b"], "a", false)).toEqual(["b"])
  })
})
