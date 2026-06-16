import { describe, expect, it } from "vitest"
import {
  getKeyString,
  isValidKeybinding,
  normalizeKeybinding,
  toDisplayFormat,
} from "./key-normalizer"

const keyboardEvent = (overrides: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    keyCode: 0,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent

describe("keybinding normalization", () => {
  it("canonicalizes modifier order, aliases, and primary key case", () => {
    expect(normalizeKeybinding("<alt-cmd-R>")).toBe("<cmd-alt-r>")
    expect(normalizeKeybinding("<cmd-alt-i>")).toBe("<cmd-alt-i>")
    expect(normalizeKeybinding("<cmd-alt-C>")).toBe("<cmd-alt-c>")
    expect(normalizeKeybinding("c")).toBe("c")
    expect(normalizeKeybinding("⌘ ⇧ K")).toBe("<cmd-shift-k>")
    expect(normalizeKeybinding("<m-s-k>")).toBe("<cmd-shift-k>")
    expect(normalizeKeybinding("<cmd-esc>")).toBe("<cmd-escape>")
  })

  it("canonicalizes arrows, special keys, function keys, and punctuation", () => {
    expect(normalizeKeybinding("<alt-arrowleft>")).toBe("<alt-left>")
    expect(normalizeKeybinding("<shift-F12>")).toBe("<shift-f12>")
    expect(normalizeKeybinding("?")).toBe("<shift-/>")
    expect(normalizeKeybinding("<cmd-?>")).toBe("<cmd-shift-/>")
    expect(normalizeKeybinding("<cmd-,>")).toBe("<cmd-,>")
    expect(normalizeKeybinding("<cmd-\\>")).toBe("<cmd-\\>")
  })

  it("canonicalizes multi-stroke sequences stroke by stroke", () => {
    expect(normalizeKeybinding("G, <alt-cmd-R>, ⌘ ⇧ K")).toBe(
      "g, <cmd-alt-r>, <cmd-shift-k>",
    )
  })

  it("uses the same canonical form for keyboard events", () => {
    expect(
      getKeyString(
        keyboardEvent({
          code: "KeyK",
          key: "K",
          metaKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe("<cmd-shift-k>")

    expect(
      getKeyString(
        keyboardEvent({
          altKey: true,
          code: "KeyR",
          key: "®",
          metaKey: true,
        }),
      ),
    ).toBe("<cmd-alt-r>")

    expect(
      getKeyString(
        keyboardEvent({
          altKey: true,
          code: "ArrowLeft",
          key: "ArrowLeft",
        }),
      ),
    ).toBe("<alt-left>")

    expect(
      getKeyString(
        keyboardEvent({
          code: "Slash",
          key: "?",
          shiftKey: true,
        }),
      ),
    ).toBe("<shift-/>")

    expect(
      getKeyString(
        keyboardEvent({
          code: "F12",
          ctrlKey: true,
          key: "F12",
        }),
      ),
    ).toBe("<ctrl-f12>")
  })

  it("validates only complete keybindings and displays canonical values", () => {
    expect(isValidKeybinding("<cmd-enter>")).toBe(true)
    expect(isValidKeybinding("<cmd>")).toBe(false)
    expect(toDisplayFormat("<cmd-shift-enter>")).toBe("⌘ ⇧ ↵")
  })
})
