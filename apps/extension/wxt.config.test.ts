import { describe, expect, it } from "vitest"
import { getExtensionPagesCsp, optionalHostPermissions } from "./wxt.config"

describe("manifest host permissions", () => {
  it("declares only web origins as optional host permissions", () => {
    expect(optionalHostPermissions).toEqual(["http://*/*", "https://*/*"])
    expect(optionalHostPermissions).not.toContain("<all_urls>")
    expect(optionalHostPermissions).not.toContain("file://*/*")
  })
})

describe("outbound automation CSP", () => {
  it("allows HTTPS and exact loopback HTTP without general plaintext HTTP", () => {
    const csp = getExtensionPagesCsp("build")
    expect(csp).toContain("https:")
    expect(csp).toContain("http://localhost:*")
    expect(csp).toContain("http://127.0.0.1:*")
    expect(csp).toContain("http://[::1]:*")
    expect(csp).not.toMatch(/connect-src[^;]*\shttp:\s/)
    expect(csp).not.toContain("connect-src *")
  })
})
