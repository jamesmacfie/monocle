import { describe, expect, it } from "vitest"
import { computeKeybindingMatch } from "./useGlobalKeybindings"

// The predicate that gates per-keystroke execute-keybinding messages: a key
// that matches nothing known must never reach the background.
describe("computeKeybindingMatch", () => {
  const exact = new Set(["<cmd-shift-k>", "g, g"])
  const prefixes = new Set(["g"])

  it("matches an exact single-stroke binding", () => {
    expect(computeKeybindingMatch("<cmd-shift-k>", exact, prefixes, [])).toBe(
      true,
    )
  })

  it("matches a known sequence prefix", () => {
    expect(computeKeybindingMatch("g", exact, prefixes, [])).toBe(true)
  })

  it("matches a continuation of the sequence in progress", () => {
    expect(computeKeybindingMatch("g", exact, prefixes, ["g"])).toBe(true)
  })

  it("rejects an unbound key with no sequence in progress", () => {
    expect(computeKeybindingMatch("x", exact, prefixes, [])).toBe(false)
  })

  it("rejects a key that abandons the sequence in progress", () => {
    expect(computeKeybindingMatch("x", exact, prefixes, ["g"])).toBe(false)
  })

  it("still matches a fresh exact binding while a sequence is in progress", () => {
    // "<cmd-shift-k>" doesn't continue "g, …" but is itself bound, so the
    // fallback isKnown(keyString) check must let it through.
    expect(
      computeKeybindingMatch("<cmd-shift-k>", exact, prefixes, ["g"]),
    ).toBe(true)
  })

  it("rejects everything when nothing is bound", () => {
    expect(
      computeKeybindingMatch("g", new Set<string>(), new Set<string>(), []),
    ).toBe(false)
  })
})
