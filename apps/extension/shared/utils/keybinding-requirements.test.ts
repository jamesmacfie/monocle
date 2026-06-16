import { describe, expect, it } from "vitest"
import {
  describeKeybindingRequirements,
  REQUIRE_NON_SHIFT_MODIFIER_MESSAGE,
  validateKeybindingRequirements,
} from "./keybinding-requirements"

const REQUIRE_MODIFIER = { requireNonShiftModifier: true }

describe("validateKeybindingRequirements", () => {
  it("passes everything when no requirements apply", () => {
    expect(validateKeybindingRequirements("g", undefined).valid).toBe(true)
    expect(validateKeybindingRequirements("<shift-k>", {}).valid).toBe(true)
    expect(
      validateKeybindingRequirements("g, s", {
        requireNonShiftModifier: false,
      }).valid,
    ).toBe(true)
  })

  it("treats an empty keybinding (clearing) as valid", () => {
    expect(validateKeybindingRequirements("", REQUIRE_MODIFIER).valid).toBe(
      true,
    )
  })

  it("accepts strokes with a non-shift modifier", () => {
    expect(
      validateKeybindingRequirements("<cmd-k>", REQUIRE_MODIFIER).valid,
    ).toBe(true)
    expect(
      validateKeybindingRequirements("<ctrl-alt-x>", REQUIRE_MODIFIER).valid,
    ).toBe(true)
    // Shift is fine as long as a non-shift modifier is also present.
    expect(
      validateKeybindingRequirements("<cmd-shift-7>", REQUIRE_MODIFIER).valid,
    ).toBe(true)
  })

  it("accepts sequences only when every stroke carries a modifier", () => {
    expect(
      validateKeybindingRequirements("<cmd-k>, <ctrl-s>", REQUIRE_MODIFIER)
        .valid,
    ).toBe(true)
    expect(
      validateKeybindingRequirements("<cmd-k>, s", REQUIRE_MODIFIER).valid,
    ).toBe(false)
    expect(validateKeybindingRequirements("g, s", REQUIRE_MODIFIER).valid).toBe(
      false,
    )
  })

  it("rejects plain keys and shift-only strokes", () => {
    for (const keybinding of ["g", "escape", "<shift-k>", "<shift-1>"]) {
      const result = validateKeybindingRequirements(
        keybinding,
        REQUIRE_MODIFIER,
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.violation).toBe("missing-non-shift-modifier")
        expect(result.message).toBe(REQUIRE_NON_SHIFT_MODIFIER_MESSAGE)
      }
    }
  })
})

describe("describeKeybindingRequirements", () => {
  it("returns a hint only when requirements apply", () => {
    expect(describeKeybindingRequirements(undefined)).toBeNull()
    expect(describeKeybindingRequirements({})).toBeNull()
    expect(
      describeKeybindingRequirements({ requireNonShiftModifier: true }),
    ).toContain("⌘")
  })
})
