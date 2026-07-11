import { describe, expect, it } from "vitest"
import { AUTOMATION_GENERATION_JSON_SCHEMA } from "./schema"

const visit = (
  value: unknown,
  callback: (node: Record<string, unknown>) => void,
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const node = value as Record<string, unknown>
  callback(node)
  Object.values(node).forEach((child) => {
    if (Array.isArray(child)) child.forEach((entry) => visit(entry, callback))
    else visit(child, callback)
  })
}

const collectSingleValueEnums = (field: string): Set<string> => {
  const values = new Set<string>()
  visit(AUTOMATION_GENERATION_JSON_SCHEMA, (node) => {
    const properties = node.properties as Record<string, unknown> | undefined
    const candidate = properties?.[field] as { enum?: unknown[] } | undefined
    if (
      candidate?.enum?.length === 1 &&
      typeof candidate.enum[0] === "string"
    ) {
      values.add(candidate.enum[0])
    }
  })
  return values
}

describe("automation generation structured-output schema", () => {
  it("closes every object and requires every declared property", () => {
    let objectCount = 0
    visit(AUTOMATION_GENERATION_JSON_SCHEMA, (node) => {
      if (node.type !== "object") return
      objectCount += 1
      expect(node.additionalProperties).toBe(false)
      const properties = Object.keys(
        (node.properties as Record<string, unknown>) ?? {},
      ).sort()
      expect([...(node.required as string[])].sort()).toEqual(properties)
    })
    expect(objectCount).toBeGreaterThan(50)
    expect(AUTOMATION_GENERATION_JSON_SCHEMA.type).toBe("object")
    expect(AUTOMATION_GENERATION_JSON_SCHEMA).not.toHaveProperty("anyOf")
  })

  it("covers every current trigger, condition, and step discriminator", () => {
    expect(collectSingleValueEnums("type")).toEqual(
      new Set([
        "null",
        "string",
        "number",
        "boolean",
        "array",
        "object",
        "manual",
        "urlMatch",
        "elementAppears",
        "interval",
        "schedule",
        "onStartup",
      ]),
    )
    expect(collectSingleValueEnums("kind")).toEqual(
      new Set([
        "elementExists",
        "elementVisible",
        "elementText",
        "urlIncludes",
        "varCompare",
        "varMatches",
        "not",
        "allOf",
        "anyOf",
        "literal",
        "snippet",
        "runtime",
        "inline",
      ]),
    )
    expect(collectSingleValueEnums("op")).toEqual(
      new Set([
        "click",
        "wait",
        "hover",
        "focus",
        "blur",
        "fill",
        "type",
        "key",
        "select",
        "check",
        "uncheck",
        "submit",
        "scroll",
        "getText",
        "removeElement",
        "hideElement",
        "injectCss",
        "setVariable",
        "insertSnippet",
        "toast",
        "navigate",
        "openUrl",
        "clipboardWrite",
        "runCommand",
        "httpRequest",
        "showSurface",
        "hideSurface",
        "branch",
        "forEach",
        "while",
      ]),
    )
  })
})
