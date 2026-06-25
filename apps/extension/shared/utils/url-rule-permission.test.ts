import { describe, expect, it } from "vitest"
import { originPatternFromUrlRule } from "./url-rule-permission"

describe("originPatternFromUrlRule", () => {
  it("derives a concrete host from a path-wildcard pattern", () => {
    expect(originPatternFromUrlRule("https://github.com/*/*/pull/*")).toEqual({
      ok: true,
      host: "github.com",
      grantable: true,
      origins: ["https://github.com/*"],
    })
  })

  it("treats a bare host as any-scheme (http + https)", () => {
    expect(originPatternFromUrlRule("example.com")).toEqual({
      ok: true,
      host: "example.com",
      grantable: true,
      origins: ["http://example.com/*", "https://example.com/*"],
    })
  })

  it("expands an explicit *:// scheme to http + https", () => {
    expect(originPatternFromUrlRule("*://github.com/*")).toEqual({
      ok: true,
      host: "github.com",
      grantable: true,
      origins: ["http://github.com/*", "https://github.com/*"],
    })
  })

  it("marks a wildcard host as not grantable", () => {
    const result = originPatternFromUrlRule("https://*/*/pull/*")
    expect(result.ok).toBe(true)
    expect(result.ok && result.host).toBe("*")
    expect(result.ok && result.grantable).toBe(false)
  })

  it("marks a subdomain wildcard as not grantable", () => {
    const result = originPatternFromUrlRule("*.example.com")
    expect(result.ok && result.grantable).toBe(false)
    expect(result.ok && result.host).toBe("*.example.com")
  })

  it("strips a port from the origin but keeps it in the display host", () => {
    expect(originPatternFromUrlRule("http://localhost:3000/*")).toEqual({
      ok: true,
      host: "localhost:3000",
      grantable: true,
      origins: ["http://localhost/*"],
    })
  })

  it("rejects empty, whitespace, bad protocol, and host-less patterns", () => {
    expect(originPatternFromUrlRule("")).toEqual({
      ok: false,
      reason: "Empty pattern",
    })
    expect(originPatternFromUrlRule("has space").ok).toBe(false)
    expect(originPatternFromUrlRule("ftp://example.com").ok).toBe(false)
    expect(originPatternFromUrlRule("https:///path").ok).toBe(false)
  })

  it("rejects single-label typos that are not real hosts", () => {
    expect(originPatternFromUrlRule("htt").ok).toBe(false)
    expect(originPatternFromUrlRule("localhost")).toMatchObject({
      ok: true,
      grantable: true,
    })
  })
})
