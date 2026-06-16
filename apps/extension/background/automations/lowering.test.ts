// Architecture: background tests. The lockstep corollary for automations:
// every content-classified step must lower (lowering.ts) to a workflow step
// the public WorkflowStepSchema accepts — a script that validates can never
// reach an executor case that fails as unsupported. Also covers
// interpolation-at-lowering, scope-key stamping, and loop retargeting.
import { describe, expect, it } from "vitest"
import type { AutomationStep } from "../../shared/types"
import type { Selector } from "../../shared/types/workflow"
import { WorkflowStepSchema } from "../../shared/types/workflowValidation"
import {
  endsSegment,
  isEngineStep,
  lowerContentStep,
  retargetForLoopIteration,
  selectorsEquivalent,
  stepExpectsNavigation,
} from "./lowering"

const css = (value: string, index?: number): Selector => ({
  strategy: "css",
  value,
  ...(index !== undefined ? { index } : {}),
})

const CONTENT_STEPS: AutomationStep[] = [
  { op: "click", target: css("#go") },
  { op: "wait", for: { timeMs: 100 } },
  { op: "hover", target: css("#menu") },
  { op: "focus", target: css("#field") },
  { op: "blur", target: css("#field") },
  { op: "fill", target: css("#user"), text: "{{user}}" },
  { op: "type", target: css("#field"), keys: ["abc"] },
  { op: "key", keys: ["Control", "a"] },
  { op: "select", target: css("#env"), by: { value: "dev" } },
  { op: "check", target: css("#agree") },
  { op: "uncheck", target: css("#agree") },
  { op: "submit", target: css("form") },
  { op: "scroll", to: "top" },
  { op: "getText", from: css("h1"), toVar: "heading" },
  { op: "removeElement", target: css(".ad"), all: true },
  { op: "hideElement", target: css(".promo") },
  { op: "injectCss", css: "body { background: black; }" },
]

const ENGINE_STEPS: AutomationStep[] = [
  { op: "setVariable", name: "v", value: "1" },
  { op: "insertSnippet", snippetId: "snip-1" },
  { op: "toast", message: "done" },
  { op: "navigate", url: "https://example.com" },
  { op: "openUrl", url: "https://example.com" },
  { op: "clipboardWrite", text: "copied" },
  { op: "runCommand", commandId: "open-new-tab" },
  {
    op: "branch",
    if: { kind: "urlIncludes", value: "x" },
    then: [{ op: "click", target: css("#go") }],
  },
  {
    op: "forEach",
    over: { elements: css(".row") },
    steps: [{ op: "click", target: css(".row") }],
  },
  {
    op: "while",
    condition: { kind: "urlIncludes", value: "x" },
    steps: [{ op: "click", target: css("#next") }],
  },
]

describe("step classification", () => {
  it("classifies engine vs content steps exhaustively", () => {
    for (const step of CONTENT_STEPS) {
      expect(isEngineStep(step)).toBe(false)
    }
    for (const step of ENGINE_STEPS) {
      expect(isEngineStep(step)).toBe(true)
    }
  })

  it("splits segments after getText (runtime vars become visible)", () => {
    expect(endsSegment({ op: "getText", from: css("h1"), toVar: "v" })).toBe(
      true,
    )
    expect(endsSegment({ op: "click", target: css("#go") })).toBe(false)
  })

  it("treats expectNavigation click/submit as segment-ending", () => {
    const navClick: AutomationStep = {
      op: "click",
      target: css("#go"),
      expectNavigation: true,
    }
    const navSubmit: AutomationStep = {
      op: "submit",
      target: css("form"),
      expectNavigation: true,
    }
    expect(stepExpectsNavigation(navClick)).toBe(true)
    expect(stepExpectsNavigation(navSubmit)).toBe(true)
    expect(endsSegment(navClick)).toBe(true)
    expect(endsSegment(navSubmit)).toBe(true)

    // Without the flag (or on other ops) it is not navigation-ending.
    expect(stepExpectsNavigation({ op: "click", target: css("#go") })).toBe(
      false,
    )
    expect(stepExpectsNavigation({ op: "wait", for: { timeMs: 1 } })).toBe(
      false,
    )
  })
})

describe("lowering", () => {
  it("lowers every content step to a schema-accepted workflow step", () => {
    for (const step of CONTENT_STEPS) {
      const lowered = lowerContentStep(
        step,
        "script-1",
        { user: "james" },
        { url: "https://dev.example.com" },
      )
      const parsed = WorkflowStepSchema.safeParse(lowered)
      expect(
        parsed.success,
        `op ${step.op} must satisfy the public schema`,
      ).toBe(true)
    }
  })

  it("interpolates fill text and stamps scope keys", () => {
    const fill = lowerContentStep(
      { op: "fill", target: css("#user"), text: "{{user | upper}}" },
      "script-1",
      { user: "james" },
      {},
    )
    expect(fill).toMatchObject({ op: "fill", text: "JAMES" })

    const hide = lowerContentStep(
      { op: "hideElement", target: css(".promo") },
      "script-1",
      {},
      {},
    )
    expect(hide).toMatchObject({ scopeKey: "automation-script-1" })
  })

  it("strips expectNavigation so the content executor gets a clean step", () => {
    for (const step of [
      { op: "click", target: css("#go"), expectNavigation: true },
      { op: "submit", target: css("form"), expectNavigation: true },
    ] as AutomationStep[]) {
      const lowered = lowerContentStep(step, "script-1", {}, {})
      expect(lowered).not.toHaveProperty("expectNavigation")
      // Still a valid workflow step after the hint is removed.
      expect(WorkflowStepSchema.safeParse(lowered).success).toBe(true)
    }
  })

  it("accepts expectNavigation on click/submit at the public schema", () => {
    expect(
      WorkflowStepSchema.safeParse({
        op: "click",
        target: css("#go"),
        expectNavigation: true,
      }).success,
    ).toBe(true)
    expect(
      WorkflowStepSchema.safeParse({
        op: "submit",
        target: css("form"),
        expectNavigation: true,
      }).success,
    ).toBe(true)
  })

  it("refuses to lower engine steps", () => {
    expect(() =>
      lowerContentStep({ op: "toast", message: "hi" }, "script-1", {}, {}),
    ).toThrow(/cannot lower/i)
  })
})

describe("loop retargeting", () => {
  it("compares selectors structurally, ignoring index", () => {
    expect(selectorsEquivalent(css(".row"), css(".row", 3))).toBe(true)
    expect(selectorsEquivalent(css(".row"), css(".other"))).toBe(false)
  })

  it("pins matching targets (including within scopes) to the iteration index", () => {
    const loopSelector = css(".row")

    const direct = retargetForLoopIteration(
      { op: "click", target: css(".row") } as AutomationStep,
      loopSelector,
      2,
    )
    expect(direct).toMatchObject({ target: { index: 2 } })

    const scoped = retargetForLoopIteration(
      {
        op: "click",
        target: {
          strategy: "text",
          value: "Delete",
          within: css(".row"),
        },
      } as AutomationStep,
      loopSelector,
      1,
    )
    expect(scoped).toMatchObject({
      target: { within: { index: 1 } },
    })

    const untouched = retargetForLoopIteration(
      { op: "click", target: css(".unrelated") } as AutomationStep,
      loopSelector,
      1,
    )
    expect(untouched).toMatchObject({ target: { strategy: "css" } })
    expect((untouched as { target: Selector }).target).not.toHaveProperty(
      "index",
    )
  })
})
