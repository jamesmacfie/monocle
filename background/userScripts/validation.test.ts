// Architecture: background tests. Document-schema coverage for
// shared/types/userScriptValidation.ts: the caps, trigger rules, structural
// checks (depth, nested step counts, navigation-in-control-flow), and the
// presentation-field constraints that keep imported documents reviewable.
import { describe, expect, it } from "vitest"
import type { UserScriptStep } from "../../shared/types"
import {
  collectStructuralIssues,
  USER_SCRIPT_MAX_STEPS,
  validateUserScriptDraft,
} from "../../shared/types/userScriptValidation"

const draft = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  name: "Dev login",
  enabled: true,
  triggers: [{ type: "manual" }],
  steps: [
    {
      op: "fill",
      target: { strategy: "css", value: "#username" },
      text: "{{user}}",
    },
  ],
  ...overrides,
})

describe("user script draft validation", () => {
  it("accepts the worked auto-login example", () => {
    const result = validateUserScriptDraft(
      draft({
        icon: "LogIn",
        color: "teal",
        urlRules: { allowUrls: ["dev.example.com"] },
        vars: {
          user: { kind: "snippet", snippetId: "a1" },
          pass: { kind: "snippet", snippetId: "b2" },
        },
        steps: [
          {
            op: "fill",
            target: { strategy: "css", value: "#username" },
            text: "{{user}}",
          },
          {
            op: "fill",
            target: { strategy: "css", value: "#password" },
            text: "{{pass}}",
          },
          { op: "click", target: { strategy: "text", value: "Sign in" } },
        ],
      }),
    )

    expect(result.success).toBe(true)
  })

  it("rejects unknown ops, free-form icons, and unknown fields", () => {
    expect(
      validateUserScriptDraft(draft({ steps: [{ op: "runJs", code: "1" }] }))
        .success,
    ).toBe(false)

    expect(validateUserScriptDraft(draft({ icon: "NotAnIcon" })).success).toBe(
      false,
    )

    expect(
      validateUserScriptDraft(draft({ somethingElse: true })).success,
    ).toBe(false)
  })

  it("requires at least one trigger and at most one of each non-manual type", () => {
    expect(validateUserScriptDraft(draft({ triggers: [] })).success).toBe(false)

    expect(
      validateUserScriptDraft(
        draft({
          triggers: [
            { type: "urlMatch" },
            { type: "urlMatch", oncePerPage: false },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      validateUserScriptDraft(
        draft({
          triggers: [
            { type: "manual" },
            { type: "urlMatch" },
            {
              type: "elementAppears",
              selector: { strategy: "css", value: "#x" },
            },
          ],
        }),
      ).success,
    ).toBe(true)
  })

  it("enforces loop caps and regex bounds", () => {
    expect(
      validateUserScriptDraft(
        draft({
          steps: [
            {
              op: "while",
              condition: { kind: "urlIncludes", value: "x" },
              maxIterations: 5000,
              steps: [{ op: "wait", for: { timeMs: 1 } }],
            },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      validateUserScriptDraft(
        draft({
          steps: [
            {
              op: "branch",
              if: { kind: "varMatches", name: "v", pattern: "([" },
              then: [{ op: "wait", for: { timeMs: 1 } }],
            },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  it("reports field-level errors", () => {
    const result = validateUserScriptDraft(draft({ name: "" }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.path === "name")).toBe(true)
    }
  })
})

describe("structural checks", () => {
  const wait: UserScriptStep = { op: "wait", for: { timeMs: 1 } }

  const nest = (depth: number): UserScriptStep =>
    depth === 0
      ? wait
      : {
          op: "branch",
          if: { kind: "urlIncludes", value: "x" },
          then: [nest(depth - 1)],
        }

  it("caps control-flow depth at 3", () => {
    expect(collectStructuralIssues([nest(3)])).toEqual([])
    expect(
      collectStructuralIssues([nest(4)]).some((issue) =>
        issue.message.includes("deeper"),
      ),
    ).toBe(true)
  })

  it("counts nested steps against the document cap", () => {
    const steps: UserScriptStep[] = [
      {
        op: "forEach",
        over: { elements: { strategy: "css", value: ".row" } },
        steps: Array.from({ length: USER_SCRIPT_MAX_STEPS }, () => wait),
      },
    ]
    expect(
      collectStructuralIssues(steps).some((issue) =>
        issue.message.includes("at most"),
      ),
    ).toBe(true)
  })

  it("rejects navigation inside loops but allows it at the top level", () => {
    expect(
      collectStructuralIssues([{ op: "navigate", url: "https://x.test" }]),
    ).toEqual([])

    expect(
      collectStructuralIssues([
        {
          op: "while",
          condition: { kind: "urlIncludes", value: "x" },
          steps: [
            { op: "openUrl", url: "https://x.test", disposition: "currentTab" },
          ],
        },
      ]).some((issue) => issue.message.includes("Navigation")),
    ).toBe(true)

    // openUrl in a new tab doesn't destroy the content context.
    expect(
      collectStructuralIssues([
        {
          op: "while",
          condition: { kind: "urlIncludes", value: "x" },
          steps: [
            { op: "openUrl", url: "https://x.test", disposition: "newTab" },
          ],
        },
      ]),
    ).toEqual([])
  })
})
