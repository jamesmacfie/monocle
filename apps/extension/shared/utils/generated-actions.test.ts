import { describe, expect, it } from "vitest"
import {
  GENERATED_ACTION_PREFIXES,
  GENERATED_ACTION_SUFFIXES,
  generatedActionIds,
  isGeneratedCommandActionId,
  parseGeneratedCommandAction,
} from "./generated-actions"

describe("generated action ids", () => {
  it("round-trips every generated action variant", () => {
    expect(
      parseGeneratedCommandAction(generatedActionIds.favorite("open")),
    ).toEqual({
      type: "favorite",
      targetCommandId: "open",
    })
    expect(
      parseGeneratedCommandAction(generatedActionIds.setKeybinding("open")),
    ).toEqual({
      type: "setKeybinding",
      targetCommandId: "open",
    })
    expect(
      parseGeneratedCommandAction(generatedActionIds.resetKeybinding("open")),
    ).toEqual({
      type: "resetKeybinding",
      targetCommandId: "open",
    })
    expect(
      parseGeneratedCommandAction(generatedActionIds.hideDomain("open")),
    ).toEqual({
      type: "hideDomain",
      targetCommandId: "open",
    })
    expect(
      parseGeneratedCommandAction(generatedActionIds.hideCommand("open")),
    ).toEqual({
      type: "hideCommand",
      targetCommandId: "open",
    })
    expect(
      parseGeneratedCommandAction(generatedActionIds.modifier("open", "cmd")),
    ).toEqual({
      type: "modifier",
      targetCommandId: "open",
      modifierKey: "cmd",
    })
    expect(
      parseGeneratedCommandAction(generatedActionIds.primary("open")),
    ).toEqual({
      type: "primary",
      targetCommandId: "open",
    })
  })

  it("exposes every reserved prefix and suffix", () => {
    for (const prefix of GENERATED_ACTION_PREFIXES) {
      expect(isGeneratedCommandActionId(`${prefix}open`)).toBe(true)
    }

    for (const suffix of GENERATED_ACTION_SUFFIXES) {
      expect(isGeneratedCommandActionId(`open${suffix}`)).toBe(true)
    }
  })

  it("ignores ordinary command ids", () => {
    expect(parseGeneratedCommandAction("open-new-tab")).toBeNull()
    expect(isGeneratedCommandActionId("open-new-tab")).toBe(false)
  })
})
