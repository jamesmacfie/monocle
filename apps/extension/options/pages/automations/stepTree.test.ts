import { describe, expect, it } from "vitest"
import type { AutomationStep } from "../../../shared/types"
import { assembleStepNodes, countStepNodes, stepNodeFromStep } from "./stepTree"

const recursiveStep: AutomationStep = {
  op: "branch",
  if: {
    kind: "allOf",
    of: [
      { kind: "urlIncludes", value: "example.com" },
      {
        kind: "not",
        of: { kind: "varMatches", name: "mode", pattern: "test" },
      },
    ],
  },
  then: [
    {
      op: "forEach",
      over: { elements: { strategy: "css", value: ".row" } },
      steps: [
        {
          op: "showSurface",
          surfaceId: "actions",
          kind: "inline",
          placement: { selector: "#toolbar", position: "append" },
          content: { text: "Tools" },
          actions: [
            {
              id: "run",
              label: "Run",
              style: "primary",
              steps: [{ op: "toast", message: "{{item}}" }],
            },
          ],
        },
      ],
    },
  ],
  else: [{ op: "wait", for: { timeMs: 100 } }],
}

describe("recursive automation step editor state", () => {
  it("round-trips nested containers without persisting UI keys", () => {
    const node = stepNodeFromStep(recursiveStep)
    const assembled = assembleStepNodes([node])

    expect(assembled).toMatchObject({ complete: true, issues: [] })
    expect(assembled.steps).toEqual([recursiveStep])
    expect(JSON.stringify(assembled.steps)).not.toContain("editorKey")
    expect(countStepNodes([node])).toBe(5)
  })

  it("keeps stable UI identity when nodes are reordered", () => {
    const first = stepNodeFromStep({ op: "toast", message: "first" })
    const second = stepNodeFromStep({ op: "toast", message: "second" })
    const reordered = [second, first]

    expect(reordered.map(({ editorKey }) => editorKey)).toEqual([
      second.editorKey,
      first.editorKey,
    ])
    expect(assembleStepNodes(reordered).steps).toEqual([
      { op: "toast", message: "second" },
      { op: "toast", message: "first" },
    ])
  })

  it("reports invalid nested JSON at its full path and blocks incomplete rows", () => {
    const node = stepNodeFromStep(recursiveStep)
    if (node.children?.kind !== "branch") throw new Error("Expected branch")
    const loop = node.children.then[0]
    if (loop.children?.kind !== "forEach") throw new Error("Expected loop")
    const surface = loop.children.steps[0]
    if (surface.children?.kind !== "surfaceActions") {
      throw new Error("Expected surface actions")
    }
    surface.children.actions[0].steps[0].row = {
      kind: "json",
      text: "{",
      parsed: null,
      error: "Unexpected end of JSON input",
    }

    const assembled = assembleStepNodes([node])

    expect(assembled.complete).toBe(false)
    expect(assembled.issues).toEqual([
      "steps.0.then.0.steps.0.actions.0.steps.0: Unexpected end of JSON input",
    ])
  })
})
