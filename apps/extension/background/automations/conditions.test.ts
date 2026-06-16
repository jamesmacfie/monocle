// Architecture: background tests. Condition evaluation
// (background/automations/conditions.ts): comparison operators (including
// loud numeric failures), var conditions against the value bag, element/URL
// conditions via injected probe runners, and the combinators.
import { describe, expect, it, vi } from "vitest"
import type { AutomationCondition } from "../../shared/types"
import type { Step, WorkflowResult } from "../../shared/types/workflow"
import { compareValues, evaluateCondition } from "./conditions"

const env = (options: {
  values?: Record<string, string>
  probe?: (steps: Step[]) => WorkflowResult
}) => ({
  values: options.values ?? {},
  pageContext: { url: "https://dev.example.com", title: "Dev" },
  runProbe: vi.fn(async (steps: Step[]) =>
    options.probe
      ? options.probe(steps)
      : ({ success: false } as WorkflowResult),
  ),
})

describe("compareValues", () => {
  it("implements the string operators", () => {
    expect(compareValues("Hello", "equals", "Hello")).toBe(true)
    expect(compareValues("Hello", "equalsIgnoreCase", "hello")).toBe(true)
    expect(compareValues("Hello", "notEquals", "World")).toBe(true)
    expect(compareValues("Hello World", "contains", "lo W")).toBe(true)
    expect(compareValues("Hello", "notContains", "x")).toBe(true)
    expect(compareValues("Hello", "startsWith", "He")).toBe(true)
    expect(compareValues("Hello", "endsWith", "lo")).toBe(true)
  })

  it("compares numbers and fails loudly on non-numeric input", () => {
    expect(compareValues("10", "greaterThan", "9")).toBe(true)
    expect(compareValues("3", "lessThan", "10")).toBe(true)
    expect(() => compareValues("abc", "greaterThan", "1")).toThrow(
      /needs numbers/i,
    )
    expect(() => compareValues("", "lessThan", "1")).toThrow(/needs numbers/i)
  })
})

describe("evaluateCondition", () => {
  it("evaluates var conditions against the bag with interpolation", async () => {
    const conditionEnv = env({ values: { status: "ready", expected: "ready" } })

    await expect(
      evaluateCondition(
        {
          kind: "varCompare",
          name: "status",
          operator: "equals",
          value: "{{expected}}",
        },
        conditionEnv,
      ),
    ).resolves.toBe(true)

    await expect(
      evaluateCondition(
        { kind: "varMatches", name: "status", pattern: "^re" },
        conditionEnv,
      ),
    ).resolves.toBe(true)
  })

  it("answers element conditions through probe workflows", async () => {
    const probed: Step[][] = []
    const conditionEnv = env({
      probe: (steps) => {
        probed.push(steps)
        return { success: true }
      },
    })

    await expect(
      evaluateCondition(
        {
          kind: "elementExists",
          selector: { strategy: "css", value: "#banner" },
        },
        conditionEnv,
      ),
    ).resolves.toBe(true)

    expect(probed[0][0]).toMatchObject({
      op: "wait",
      for: { selector: { value: "#banner" }, state: "attached" },
    })
  })

  it("compares probed element text engine-side", async () => {
    const conditionEnv = env({
      values: {},
      probe: (steps) =>
        steps[0]?.op === "getText"
          ? { success: true, vars: { __monocleProbe: "Welcome back" } }
          : { success: false },
    })

    await expect(
      evaluateCondition(
        {
          kind: "elementText",
          selector: { strategy: "css", value: "h1" },
          operator: "contains",
          value: "Welcome",
        },
        conditionEnv,
      ),
    ).resolves.toBe(true)
  })

  it("treats a missing element's text comparison as false, not fatal", async () => {
    const conditionEnv = env({ probe: () => ({ success: false }) })

    await expect(
      evaluateCondition(
        {
          kind: "elementText",
          selector: { strategy: "css", value: "#missing" },
          operator: "equals",
          value: "x",
        },
        conditionEnv,
      ),
    ).resolves.toBe(false)
  })

  it("combines with not/allOf/anyOf", async () => {
    const truthy: AutomationCondition = {
      kind: "varCompare",
      name: "v",
      operator: "equals",
      value: "1",
    }
    const falsy: AutomationCondition = {
      kind: "varCompare",
      name: "v",
      operator: "equals",
      value: "2",
    }
    const conditionEnv = env({ values: { v: "1" } })

    await expect(
      evaluateCondition({ kind: "not", of: falsy }, conditionEnv),
    ).resolves.toBe(true)
    await expect(
      evaluateCondition({ kind: "allOf", of: [truthy, falsy] }, conditionEnv),
    ).resolves.toBe(false)
    await expect(
      evaluateCondition({ kind: "anyOf", of: [falsy, truthy] }, conditionEnv),
    ).resolves.toBe(true)
  })
})
