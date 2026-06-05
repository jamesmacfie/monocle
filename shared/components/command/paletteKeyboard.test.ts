import { describe, expect, it } from "vitest"
import type { Suggestion } from "../../../shared/types"
import { getPaletteKeyboardCommand } from "./paletteKeyboard"

const actionWithMenu: Suggestion = {
  id: "run-command",
  name: "Run Command",
  type: "action",
  actionLabel: "Run",
  actions: [
    {
      id: "run-command-enter-action",
      name: "Run",
      type: "action",
      actionLabel: "Run",
    },
  ],
}

describe("palette keyboard decisions", () => {
  it("opens the action menu for supported focused rows", () => {
    expect(
      getPaletteKeyboardCommand({
        key: "Alt",
        searchValue: "",
        pageCount: 1,
        isActionsOpen: false,
        focusedSuggestion: actionWithMenu,
      }),
    ).toBe("open-actions")
  })

  it("uses Escape for back navigation on child pages and close on root", () => {
    expect(
      getPaletteKeyboardCommand({
        key: "Escape",
        searchValue: "",
        pageCount: 2,
        isActionsOpen: false,
      }),
    ).toBe("navigate-back")
    expect(
      getPaletteKeyboardCommand({
        key: "Escape",
        searchValue: "",
        pageCount: 1,
        isActionsOpen: false,
      }),
    ).toBe("close")
  })

  it("uses Backspace for back navigation only on empty nested search", () => {
    expect(
      getPaletteKeyboardCommand({
        key: "Backspace",
        searchValue: "",
        pageCount: 2,
        isActionsOpen: false,
      }),
    ).toBe("navigate-back")
    expect(
      getPaletteKeyboardCommand({
        key: "Backspace",
        searchValue: "tab",
        pageCount: 2,
        isActionsOpen: false,
      }),
    ).toBe("none")
  })

  it("does not handle palette shortcuts while the action menu is open", () => {
    expect(
      getPaletteKeyboardCommand({
        key: "Escape",
        searchValue: "",
        pageCount: 2,
        isActionsOpen: true,
      }),
    ).toBe("none")
  })
})
