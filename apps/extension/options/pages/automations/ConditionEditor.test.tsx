// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import type { AutomationCondition } from "../../../shared/types"
import { ConditionEditor, createDefaultCondition } from "./ConditionEditor"

afterEach(cleanup)

const KINDS: AutomationCondition["kind"][] = [
  "elementExists",
  "elementVisible",
  "elementText",
  "urlIncludes",
  "varCompare",
  "varMatches",
  "not",
  "allOf",
  "anyOf",
]

function Harness() {
  const [condition, setCondition] = useState<AutomationCondition>(
    createDefaultCondition(),
  )
  return <ConditionEditor condition={condition} onChange={setCondition} />
}

describe("ConditionEditor", () => {
  it("creates the matching editable shape for every condition kind", () => {
    for (const kind of KINDS) {
      expect(createDefaultCondition(kind).kind).toBe(kind)
    }
  })

  it("edits composite conditions recursively", () => {
    render(<Harness />)
    const rootKind = screen.getByLabelText("Condition")
    fireEvent.change(rootKind, { target: { value: "allOf" } })
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }))

    const kinds = screen.getAllByLabelText("Condition")
    expect(kinds).toHaveLength(3)
    fireEvent.change(kinds[2], { target: { value: "varMatches" } })
    expect(screen.getByLabelText("Regular expression")).toBeTruthy()
  })

  it("shows a validation error at the exact nested condition", () => {
    const condition: AutomationCondition = {
      kind: "allOf",
      of: [
        { kind: "urlIncludes", value: "ok" },
        { kind: "varMatches", name: "mode", pattern: "[" },
      ],
    }
    render(
      <ConditionEditor
        condition={condition}
        issues={[
          {
            path: "steps.0.if.of.1.pattern",
            message: "Invalid regular expression",
          },
        ]}
        path={["steps", 0, "if"]}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByText("pattern: Invalid regular expression")).toBeTruthy()
  })
})
