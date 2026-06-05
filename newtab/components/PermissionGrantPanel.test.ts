import { describe, expect, it } from "vitest"
import { normalizeGrantPermission } from "./PermissionGrantPanel"

describe("normalizeGrantPermission", () => {
  it("accepts known extension permissions", () => {
    expect(normalizeGrantPermission("bookmarks")).toBe("bookmarks")
    expect(normalizeGrantPermission("browsingData")).toBe("browsingData")
  })

  it("rejects empty and unknown permission values", () => {
    expect(normalizeGrantPermission(null)).toBeNull()
    expect(normalizeGrantPermission("")).toBeNull()
    expect(normalizeGrantPermission("unknown")).toBeNull()
  })
})
