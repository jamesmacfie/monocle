import { describe, expect, it } from "vitest"
import { calculateTimeBoost } from "./usage"

describe("calculateTimeBoost", () => {
  it("is neutral without history and strongest at the current hour", () => {
    expect(calculateTimeBoost(new Array(24).fill(0), 9)).toBe(1)

    const usage = new Array(24).fill(0)
    usage[9] = 10
    expect(calculateTimeBoost(usage, 9)).toBe(1.5)
    expect(calculateTimeBoost(usage, 11)).toBe(1.3)
  })

  it("wraps the similarity window across midnight", () => {
    const usage = new Array(24).fill(0)
    usage[23] = 4

    expect(calculateTimeBoost(usage, 0)).toBe(1.4)
  })
})
