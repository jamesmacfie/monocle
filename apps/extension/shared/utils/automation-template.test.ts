// Architecture: shared/ utility tests. Covers stage-1 template expansion
// (shared/utils/automation-template.ts): lookups, namespaced references,
// the transform whitelist, escaping, and unknown-reference reporting.
import { describe, expect, it } from "vitest"
import {
  collectTemplateReferences,
  expandTemplate,
  isKnownTransform,
} from "./automation-template"

describe("expandTemplate", () => {
  it("expands plain and namespaced references", () => {
    const result = expandTemplate(
      "Hi {{user}}, you are on {{trigger.url}} with {{params.env}}",
      {
        user: "james",
        "trigger.url": "https://example.com",
        "params.env": "staging",
      },
    )

    expect(result.text).toBe(
      "Hi james, you are on https://example.com with staging",
    )
    expect(result.unknownReferences).toEqual([])
  })

  it("expands unknown references to empty string and reports them", () => {
    const result = expandTemplate("Hello {{missing}}!", {})
    expect(result.text).toBe("Hello !")
    expect(result.unknownReferences).toEqual(["missing"])
  })

  it("applies piped transforms left to right", () => {
    expect(
      expandTemplate("{{name | trim | upper}}", { name: "  dev user  " }).text,
    ).toBe("DEV USER")

    expect(
      expandTemplate("{{item | slice:0:3 | lower}}", { item: "ABCDEFG" }).text,
    ).toBe("abc")

    expect(
      expandTemplate("{{url | encodeUriComponent}}", {
        url: "https://example.com/?q=a b",
      }).text,
    ).toBe(encodeURIComponent("https://example.com/?q=a b"))

    expect(expandTemplate("{{v | length}}", { v: "12345" }).text).toBe("5")

    expect(
      expandTemplate("{{v | replace:foo:bar}}", { v: "foo foo" }).text,
    ).toBe("bar foo")
  })

  it("ignores unknown transforms instead of corrupting values", () => {
    expect(expandTemplate("{{v | sparkle}}", { v: "plain" }).text).toBe("plain")
  })

  it("escapes \\{{ to a literal {{", () => {
    const result = expandTemplate("literal \\{{not-a-var}} and {{v}}", {
      v: "x",
    })
    expect(result.text).toBe("literal {{not-a-var}} and x")
    expect(result.unknownReferences).toEqual([])
  })

  it("leaves single braces and malformed tokens untouched", () => {
    expect(expandTemplate("{date:yyyy} {v}", {}).text).toBe("{date:yyyy} {v}")
  })

  it("expands snippet-style references", () => {
    expect(
      expandTemplate("{{snippet:a1b2-c3}}", { "snippet:a1b2-c3": "body" }).text,
    ).toBe("body")
  })
})

describe("collectTemplateReferences", () => {
  it("lists referenced names without transforms", () => {
    expect(
      collectTemplateReferences(
        "{{user | trim}} {{trigger.url}} \\{{escaped}} {{snippet:id-1}}",
      ),
    ).toEqual(["user", "trigger.url", "snippet:id-1"])
  })
})

describe("isKnownTransform", () => {
  it("accepts whitelist entries with arguments and rejects others", () => {
    expect(isKnownTransform("trim")).toBe(true)
    expect(isKnownTransform("slice:0:40")).toBe(true)
    expect(isKnownTransform("eval")).toBe(false)
  })
})
