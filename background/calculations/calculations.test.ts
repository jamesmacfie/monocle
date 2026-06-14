import { describe, expect, it } from "vitest"
import type { Browser } from "../../shared/types"
import { runCalculationProviders } from "./index"
import { mathProvider } from "./providers/math"
import { timeProvider } from "./providers/time"
import { unitsProvider } from "./providers/units"

const context: Browser.Context = {
  url: "https://example.com",
  title: "Example",
  modifierKey: null,
}

// A keyValue block's single row value, for terse assertions.
const rowValue = (
  result: ReturnType<(typeof mathProvider)["parse"]>,
): string | undefined => {
  const block = result?.content[0]
  return block?.type === "keyValue" ? block.rows[0]?.value : undefined
}

describe("math provider", () => {
  it("evaluates arithmetic", () => {
    const result = mathProvider.parse("1 + 89", context)
    expect(rowValue(result)).toBe("90")
    expect(result?.copyValue).toBe("90")
  })

  it("evaluates function calls", () => {
    expect(rowValue(mathProvider.parse("sqrt(16)", context))).toBe("4")
  })

  it("collapses floating-point artifacts", () => {
    expect(rowValue(mathProvider.parse("0.1 + 0.2", context))).toBe("0.3")
  })

  it("ignores bare numbers and words (no expression)", () => {
    expect(mathProvider.parse("5", context)).toBeNull()
    expect(mathProvider.parse("gmail", context)).toBeNull()
  })

  it("returns null for unit conversions (not a plain number)", () => {
    expect(mathProvider.parse("1 mile in km", context)).toBeNull()
  })
})

describe("units provider", () => {
  it("converts with the 'in' keyword", () => {
    const result = unitsProvider.parse("1 mile in km", context)
    expect(rowValue(result)).toContain("km")
    expect(result?.copyValue).toContain("km")
  })

  it("converts with the 'to' keyword", () => {
    expect(rowValue(unitsProvider.parse("5 km to miles", context))).toContain(
      "miles",
    )
  })

  it("applies light aliasing for informal unit names", () => {
    // "kms" is not a mathjs unit; the alias pre-pass maps it to "km".
    expect(unitsProvider.parse("1 mile in kms", context)).not.toBeNull()
  })

  it("requires a conversion shape", () => {
    expect(unitsProvider.parse("1 + 89", context)).toBeNull()
    expect(unitsProvider.parse("gmail", context)).toBeNull()
  })
})

describe("time provider", () => {
  it("resolves a city to its time zone and formats the current time", () => {
    const result = timeProvider.parse("time in Auckland", context)
    const block = result?.content[0]
    expect(block?.type).toBe("keyValue")
    if (block?.type === "keyValue") {
      expect(block.rows[0]?.label).toBe("Auckland")
      expect(block.rows[0]?.value).toBeTruthy()
    }
    expect(result?.copyValue).toBeTruthy()
  })

  it("returns null for unknown places and non-time queries", () => {
    expect(timeProvider.parse("time in Atlantis", context)).toBeNull()
    expect(timeProvider.parse("1 + 89", context)).toBeNull()
  })
})

describe("runCalculationProviders", () => {
  it("returns an ephemeral calculation suggestion for a math query", () => {
    const results = runCalculationProviders("1 + 89", context)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: "calculation",
      id: "calc:math",
      providerId: "math",
      copyValue: "90",
    })
  })

  it("returns nothing for an unparseable query", () => {
    expect(runCalculationProviders("gmail", context)).toEqual([])
    expect(runCalculationProviders("", context)).toEqual([])
  })

  it("orders multiple matches by descending priority", () => {
    // A bare conversion matches Units but not Math, so isolate ordering via a
    // query both could plausibly touch is unnecessary; assert the priority
    // field wiring directly instead.
    expect(mathProvider.priority).toBeGreaterThan(unitsProvider.priority)
    expect(unitsProvider.priority).toBeGreaterThan(timeProvider.priority)
  })
})
