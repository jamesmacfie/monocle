import { describe, expect, it } from "vitest"
import {
  inspectHttpEndpoint,
  inspectJsonValue,
  interpolateJsonStrings,
  validateHttpHeaderName,
} from "./http-request-policy"

describe("HTTP request policy", () => {
  it("derives concrete cross-browser grant patterns without ports or paths", () => {
    expect(
      inspectHttpEndpoint("https://api.example.com:8443/events"),
    ).toMatchObject({
      ok: true,
      permissionPattern: "https://api.example.com/*",
    })
    expect(inspectHttpEndpoint("http://localhost:43121/events")).toMatchObject({
      ok: true,
      permissionPattern: "http://localhost/*",
    })
    expect(inspectHttpEndpoint("http://[::1]:43121/events")).toMatchObject({
      ok: true,
      permissionPattern: "http://[::1]/*",
    })
  })

  it("refuses remote plaintext, hostname tricks, credentials, fragments, and templates", () => {
    for (const url of [
      "http://example.com/events",
      "http://localhost.example.com/events",
      "http://127.0.0.1.example.com/events",
      "https://user:pass@example.com/events",
      "https://example.com/events#fragment",
      "https://{{host}}/events",
    ]) {
      expect(inspectHttpEndpoint(url).ok).toBe(false)
    }
  })

  it("blocks browser-controlled headers case-insensitively", () => {
    expect(validateHttpHeaderName("Authorization")).toBeNull()
    expect(validateHttpHeaderName("CoOkIe")).not.toBeNull()
    expect(validateHttpHeaderName("Sec-Fetch-Site")).not.toBeNull()
    expect(validateHttpHeaderName("Proxy-Authorization")).not.toBeNull()
  })

  it("interpolates string leaves only and enforces JSON shape limits", async () => {
    const value = await interpolateJsonStrings(
      { key: "{{x}}", nested: [1, true, null, "{{y}}"] },
      async (text) => text.replace("{{x}}", "X").replace("{{y}}", "Y"),
    )
    expect(value).toEqual({ key: "X", nested: [1, true, null, "Y"] })
    expect(inspectJsonValue(value).ok).toBe(true)
    expect(inspectJsonValue(Number.NaN).ok).toBe(false)
    expect(inspectJsonValue({ value: undefined }).ok).toBe(false)
  })
})
