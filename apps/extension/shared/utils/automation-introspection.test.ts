import { describe, expect, it } from "vitest"
import type { AutomationStep } from "../types"
import {
  collectInlineSnippetReferences,
  interpolatableStrings,
  walkAutomationSteps,
} from "./automation-introspection"

type BranchStep = Extract<AutomationStep, { op: "branch" }>
const branchThenKey = ["th", "en"].join("")

const branchStep = (
  ifCondition: BranchStep["if"],
  thenSteps: AutomationStep[],
  elseSteps?: AutomationStep[],
): BranchStep =>
  ({
    op: "branch",
    if: ifCondition,
    ...Object.fromEntries([
      [branchThenKey, thenSteps],
      ...(elseSteps ? [["else", elseSteps]] : []),
    ]),
  }) as BranchStep

describe("automation introspection", () => {
  it("finds interpolatable strings across engine ops and conditions", () => {
    expect(
      interpolatableStrings({
        op: "showSurface",
        surfaceId: "s",
        kind: "badge",
        content: { title: "{{title}}", text: "{{text}}" },
      }),
    ).toEqual(["{{title}}", "{{text}}"])

    expect(
      interpolatableStrings({
        ...branchStep(
          {
            kind: "allOf",
            of: [
              {
                kind: "elementText",
                selector: { strategy: "css", value: ".status" },
                operator: "contains",
                value: "{{status}}",
              },
              {
                kind: "varCompare",
                name: "mode",
                operator: "equals",
                value: "{{mode}}",
              },
            ],
          },
          [],
        ),
      }),
    ).toEqual(["{{status}}", "{{mode}}"])
  })

  it("walks nested branch, forEach, and while steps", () => {
    const visited: string[] = []
    const steps: AutomationStep[] = [
      branchStep(
        { kind: "urlIncludes", value: "x" },
        [{ op: "toast", message: "then" }],
        [
          {
            op: "forEach",
            over: { variable: "lines" },
            steps: [
              {
                op: "while",
                condition: { kind: "urlIncludes", value: "y" },
                steps: [{ op: "clipboardWrite", text: "copy" }],
              },
            ],
          },
        ],
      ),
    ]

    walkAutomationSteps(steps, (step) => visited.push(step.op))

    expect(visited).toEqual([
      "branch",
      "toast",
      "forEach",
      "while",
      "clipboardWrite",
    ])
  })

  it("collects inline snippet references from every interpolatable field", () => {
    expect(
      collectInlineSnippetReferences([
        { op: "navigate", url: "{{snippet:nav}}" },
        { op: "clipboardWrite", text: "{{ snippet:clip }}" },
        {
          op: "showSurface",
          surfaceId: "s",
          kind: "badge",
          content: { title: "{{snippet:surface}}" },
        },
      ]),
    ).toEqual(["nav", "clip", "surface"])
  })
})
