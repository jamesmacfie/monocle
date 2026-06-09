import { describe, expect, it } from "vitest"
import type { Suggestion } from "../../../shared/types"
import {
  canOpenActionMenu,
  getPrimaryNavigationActionTarget,
  getSuggestionActions,
} from "./actionMenu"

const generatedAction = (targetCommandId: string): Suggestion => ({
  id: `${targetCommandId}-enter-action`,
  name: "Open",
  type: "action",
  actionLabel: "Open",
  executionContext: {
    type: "primary",
    targetCommandId,
  },
})

const suggestion = (
  type: "action" | "submit" | "search" | "group",
): Suggestion =>
  ({
    id: `${type}-command`,
    name: `${type} command`,
    type,
    actionLabel: type === "group" ? "Open" : "Run",
    actions: [generatedAction(`${type}-command`)],
  }) as Suggestion

describe("action menu contract", () => {
  it("exposes action menus for action, submit, search, and group rows", () => {
    for (const type of ["action", "submit", "search", "group"] as const) {
      const item = suggestion(type)

      expect(canOpenActionMenu(item)).toBe(true)
      expect(getSuggestionActions(item)).toHaveLength(1)
    }
  })

  it("does not expose action menus for input and display rows", () => {
    const input: Suggestion = {
      id: "input-command",
      name: "Input",
      type: "input",
      inputField: { id: "name", label: "Name", type: "text" },
    }
    const display: Suggestion = {
      id: "display-command",
      name: "Display",
      type: "display",
    }

    expect(canOpenActionMenu(input)).toBe(false)
    expect(canOpenActionMenu(display)).toBe(false)
  })

  it("treats primary group and search actions as navigation targets", () => {
    expect(
      getPrimaryNavigationActionTarget(
        suggestion("group"),
        generatedAction("group-command"),
      ),
    ).toBe("group-command")
    expect(
      getPrimaryNavigationActionTarget(
        suggestion("search"),
        generatedAction("search-command"),
      ),
    ).toBe("search-command")
    expect(
      getPrimaryNavigationActionTarget(
        suggestion("action"),
        generatedAction("action-command"),
      ),
    ).toBeNull()
  })
})
