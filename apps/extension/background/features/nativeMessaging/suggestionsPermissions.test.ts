// Architecture: background tests. The bridge drops suggestions whose optional
// permissions are not granted (no grant flow over the bridge). Covers the pure
// subset filter behind that behavior.
import { describe, expect, it } from "vitest"
import type { Suggestion } from "../../../shared/types"
import { permittedByGrants } from "./suggestions"

const row = (id: string, permissions?: string[]): Suggestion =>
  ({ id, name: id, type: "action", permissions }) as Suggestion

describe("permittedByGrants", () => {
  it("keeps rows needing no permission and those fully granted; drops the rest", () => {
    const rows = [
      row("none"),
      row("granted", ["tabs"]),
      row("partial", ["tabs", "history"]),
      row("ungranted", ["bookmarks"]),
    ]
    const kept = permittedByGrants(rows, new Set(["tabs"])).map((r) => r.id)
    expect(kept).toEqual(["none", "granted"])
  })

  it("drops everything needing a permission when nothing is granted (fail-closed)", () => {
    const rows = [row("none"), row("needs", ["tabs"])]
    expect(permittedByGrants(rows, new Set()).map((r) => r.id)).toEqual([
      "none",
    ])
  })
})
