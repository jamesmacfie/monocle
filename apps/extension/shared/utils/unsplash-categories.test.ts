import { describe, expect, it } from "vitest"
import { getCategoryQueries, UNSPLASH_CATEGORIES } from "./unsplash-categories"

describe("unsplash categories", () => {
  it("returns an empty list when no categories are enabled", () => {
    expect(getCategoryQueries(undefined)).toEqual([])
    expect(getCategoryQueries([])).toEqual([])
  })

  it("maps known category keys to their query terms in order", () => {
    expect(getCategoryQueries(["nature", "space"])).toEqual([
      "nature landscape",
      "space galaxy",
    ])
  })

  it("drops unknown keys", () => {
    expect(getCategoryQueries(["nature", "not-a-category"])).toEqual([
      "nature landscape",
    ])
  })

  it("exposes a unique key per category", () => {
    const keys = UNSPLASH_CATEGORIES.map((category) => category.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
