import { describe, expect, it } from "vitest"
import { evaluateKeybindingAssignment, isProperStrokePrefix } from "./conflicts"
import type { KeybindingCommandEntry } from "./source"

const entry = (
  id: string,
  keybinding: string,
  behavior: KeybindingCommandEntry["behavior"] = "execute",
): KeybindingCommandEntry => ({
  id,
  name: id,
  keybinding,
  behavior,
})

describe("isProperStrokePrefix", () => {
  it("distinguishes shorter prefixes from equality and divergence", () => {
    expect(isProperStrokePrefix(["g"], ["g", "h"])).toBe(true)
    expect(isProperStrokePrefix(["g"], ["g"])).toBe(false)
    expect(isProperStrokePrefix(["g"], ["x", "h"])).toBe(false)
  })
})

describe("evaluateKeybindingAssignment", () => {
  it("blocks an exact conflict", () => {
    expect(
      evaluateKeybindingAssignment(
        [entry("existing", "<cmd-k>")],
        "<cmd-k>",
        undefined,
        "execute",
      ),
    ).toMatchObject({
      hasConflict: true,
      conflictType: "exact",
      conflictingCommand: { id: "existing" },
      warnings: [],
    })
  })

  it("blocks a sequence shadowed by an open-palette prefix", () => {
    expect(
      evaluateKeybindingAssignment(
        [entry("palette", "g", "openPaletteAtCommand")],
        "g, h",
        undefined,
        "execute",
      ),
    ).toMatchObject({
      hasConflict: true,
      conflictType: "shadowed-by-open-palette",
      conflictingCommand: { id: "palette" },
    })
  })

  it("reports execute-prefix overlap as a non-blocking warning", () => {
    expect(
      evaluateKeybindingAssignment(
        [entry("short", "g")],
        "g, h",
        undefined,
        "execute",
      ),
    ).toEqual({
      hasConflict: false,
      conflictingCommand: null,
      warnings: [
        {
          type: "prefix-overlap",
          direction: "candidate-extends-existing",
          command: { id: "short", name: "short" },
          keybinding: "g",
        },
      ],
    })
  })

  it("allows a clean assignment and excludes the target command", () => {
    expect(
      evaluateKeybindingAssignment(
        [entry("target", "<cmd-k>"), entry("other", "<cmd-p>")],
        "<cmd-k>",
        "target",
        "execute",
      ),
    ).toEqual({
      hasConflict: false,
      conflictingCommand: null,
      warnings: [],
    })
  })
})
