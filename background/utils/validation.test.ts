import { describe, expect, it } from "vitest"
import { validateIncomingMessage } from "./validation"

const context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

describe("message business validation", () => {
  it("accepts canonical keybindings with punctuation, arrows, and sequences", () => {
    expect(
      validateIncomingMessage(
        {
          type: "execute-keybinding",
          keybinding: "<cmd-,>",
          context,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "execute-keybinding",
          keybinding: "<alt-left>, <cmd-shift-/>",
          context,
        },
        {},
      ).success,
    ).toBe(true)
  })

  it("rejects incomplete modifier-only keybindings", () => {
    expect(
      validateIncomingMessage(
        {
          type: "execute-keybinding",
          keybinding: "<cmd>",
          context,
        },
        {},
      ).success,
    ).toBe(false)
  })
})
