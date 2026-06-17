import { describe, expect, it } from "vitest"
import { optionalHostPermissions } from "./wxt.config"

describe("manifest host permissions", () => {
  it("declares only web origins as optional host permissions", () => {
    expect(optionalHostPermissions).toEqual(["http://*/*", "https://*/*"])
    expect(optionalHostPermissions).not.toContain("<all_urls>")
    expect(optionalHostPermissions).not.toContain("file://*/*")
  })
})
