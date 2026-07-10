// Architecture: background tests. Document-schema coverage for
// shared/types/automationValidation.ts: the caps, trigger rules, structural
// checks (depth, nested step counts, navigation-in-control-flow), and the
// presentation-field constraints that keep imported documents reviewable.
import { describe, expect, it } from "vitest"
import type { AutomationStep } from "../../shared/types"
import {
  AUTOMATION_MAX_STEPS,
  collectStructuralIssues,
  validateAutomationDraft,
} from "../../shared/types/automationValidation"

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

describe("automation draft validation", () => {
  it("accepts the worked auto-login example", () => {
    const result = validateAutomationDraft(
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
      validateAutomationDraft(draft({ steps: [{ op: "runJs", code: "1" }] }))
        .success,
    ).toBe(false)

    expect(validateAutomationDraft(draft({ icon: "NotAnIcon" })).success).toBe(
      false,
    )

    expect(
      validateAutomationDraft(draft({ somethingElse: true })).success,
    ).toBe(false)
  })

  it("requires at least one trigger and at most one of each non-manual type", () => {
    expect(validateAutomationDraft(draft({ triggers: [] })).success).toBe(false)

    expect(
      validateAutomationDraft(
        draft({
          triggers: [
            { type: "urlMatch" },
            { type: "urlMatch", oncePerPage: false },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      validateAutomationDraft(
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
      validateAutomationDraft(
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
      validateAutomationDraft(
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
    const result = validateAutomationDraft(draft({ name: "" }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.path === "name")).toBe(true)
    }
  })
})

describe("structural checks", () => {
  const wait: AutomationStep = { op: "wait", for: { timeMs: 1 } }

  const nest = (depth: number): AutomationStep =>
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
    const steps: AutomationStep[] = [
      {
        op: "forEach",
        over: { elements: { strategy: "css", value: ".row" } },
        steps: Array.from({ length: AUTOMATION_MAX_STEPS }, () => wait),
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

describe("surface engine ops", () => {
  it("accepts inline actions and counts their nested steps", () => {
    const inline = {
      op: "showSurface" as const,
      surfaceId: "open-ide",
      kind: "inline" as const,
      placement: { selector: "#header", position: "append" as const },
      content: { text: "Monocle IDE" },
      actions: [
        {
          id: "openRepository",
          label: "Open in IDE",
          steps: [{ op: "toast" as const, message: "Opening" }],
        },
      ],
    }
    expect(validateAutomationDraft(draft({ steps: [inline] })).success).toBe(
      true,
    )
    expect(collectStructuralIssues([inline])).toEqual([])

    const manyNested = {
      ...inline,
      actions: [
        {
          ...inline.actions[0],
          steps: Array.from({ length: AUTOMATION_MAX_STEPS }, () => ({
            op: "toast" as const,
            message: "x",
          })),
        },
      ],
    }
    expect(
      collectStructuralIssues([manyNested]).some((issue) =>
        issue.message.includes("at most"),
      ),
    ).toBe(true)
  })

  it("rejects duplicate inline action ids and markup fields", () => {
    const base = {
      op: "showSurface",
      surfaceId: "inline",
      kind: "inline",
      placement: { selector: "#header", position: "after" },
      content: {},
      actions: [
        { id: "run", label: "One", steps: [{ op: "toast", message: "1" }] },
        { id: "run", label: "Two", steps: [{ op: "toast", message: "2" }] },
      ],
    }
    expect(validateAutomationDraft(draft({ steps: [base] })).success).toBe(
      false,
    )
    expect(
      validateAutomationDraft(
        draft({
          steps: [{ ...base, actions: [base.actions[0]], html: "<button>" }],
        }),
      ).success,
    ).toBe(false)
  })
  it("accepts a showSurface step with declarative content", () => {
    const result = validateAutomationDraft(
      draft({
        steps: [
          {
            op: "showSurface",
            surfaceId: "note",
            kind: "badge",
            content: { icon: "Shield", title: "{{trigger.url}}" },
          },
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  it("accepts a blocking overlay showSurface with urlMatch", () => {
    const result = validateAutomationDraft(
      draft({
        steps: [
          {
            op: "showSurface",
            surfaceId: "block",
            kind: "overlay",
            blocking: true,
            urlMatch: { allowUrls: ["*://*.example.com/*"] },
            content: { title: "Blocked" },
          },
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  it("accepts a hideSurface step", () => {
    const result = validateAutomationDraft(
      draft({ steps: [{ op: "hideSurface", surfaceId: "note" }] }),
    )
    expect(result.success).toBe(true)
  })

  it("rejects an unknown surface kind", () => {
    const result = validateAutomationDraft(
      draft({
        steps: [
          { op: "showSurface", surfaceId: "x", kind: "tooltip", content: {} },
        ],
      }),
    )
    expect(result.success).toBe(false)
  })

  it("rejects modal and picker surface kinds until automations support them", () => {
    expect(
      validateAutomationDraft(
        draft({
          steps: [
            { op: "showSurface", surfaceId: "x", kind: "modal", content: {} },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      validateAutomationDraft(
        draft({
          steps: [
            { op: "showSurface", surfaceId: "x", kind: "picker", content: {} },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  it("rejects modal/picker-only surface content fields", () => {
    expect(
      validateAutomationDraft(
        draft({
          steps: [
            {
              op: "showSurface",
              surfaceId: "x",
              kind: "badge",
              content: { blocks: [{ type: "markdown", text: "**hi**" }] },
            },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      validateAutomationDraft(
        draft({
          steps: [
            {
              op: "showSurface",
              surfaceId: "x",
              kind: "overlay",
              content: { css: ["font-family"] },
            },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  it("rejects unknown fields on the content (strict)", () => {
    const result = validateAutomationDraft(
      draft({
        steps: [
          {
            op: "showSurface",
            surfaceId: "x",
            kind: "badge",
            content: { html: "<script>" },
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
  })
})

describe("httpRequest engine op", () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    op: "httpRequest",
    method: "POST",
    url: "http://127.0.0.1:43121/monocle/events",
    headers: { Authorization: "Bearer {{token}}" },
    body: { event: "open", url: "{{trigger.url}}" },
    response: {
      json: [{ path: ["requestId"], toVar: "requestId", required: true }],
    },
    ...overrides,
  })

  it("accepts HTTPS and exact loopback HTTP", () => {
    expect(validateAutomationDraft(draft({ steps: [request()] })).success).toBe(
      true,
    )
    expect(
      validateAutomationDraft(
        draft({ steps: [request({ url: "https://api.example.com/events" })] }),
      ).success,
    ).toBe(true)
    expect(
      validateAutomationDraft(
        draft({ steps: [request({ url: "http://[::1]:43121/events" })] }),
      ).success,
    ).toBe(true)
  })

  it("rejects remote HTTP, dynamic URLs, credentials, fragments, GET bodies, and controlled headers", () => {
    for (const invalid of [
      request({ url: "http://example.com/events" }),
      request({ url: "https://{{host}}/events" }),
      request({ url: "https://user:pass@example.com/events" }),
      request({ url: "https://example.com/events#secret" }),
      request({ method: "GET" }),
      request({ headers: { Cookie: "x" } }),
      request({ headers: { Foo: "a", foo: "b" } }),
    ]) {
      expect(validateAutomationDraft(draft({ steps: [invalid] })).success).toBe(
        false,
      )
    }
  })
})
