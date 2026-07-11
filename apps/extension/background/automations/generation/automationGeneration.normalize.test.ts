import { describe, expect, it } from "vitest"
import type { AutomationGenerationIr } from "./contract"
import { normalizeAutomationGeneration } from "./normalize"

const baseIr = (): AutomationGenerationIr => ({
  note: "",
  script: {
    schemaVersion: 1,
    name: "Post page data",
    description: null,
    icon: null,
    color: null,
    enabled: true,
    urlRules: { allowUrls: ["https://example.com/*"], denyUrls: [] },
    triggers: [
      {
        type: "urlMatch",
        on: null,
        oncePerPage: null,
        delayMs: null,
        disarmed: false,
      },
    ],
    variables: [{ name: "status", definition: { kind: "runtime" } }],
    steps: [
      {
        op: "httpRequest",
        id: null,
        description: null,
        method: "POST",
        url: "https://api.example.com/events",
        headers: [
          { name: "X-Event-Type", value: "page-view" },
          { name: "X-Trace", value: "{{status}}" },
        ],
        body: {
          type: "object",
          entries: [
            { key: "title", value: { type: "string", value: "{title}" } },
            { key: "optional", value: { type: "null" } },
          ],
        },
        timeoutMs: null,
        response: {
          statusToVar: "status",
          json: null,
        },
      },
    ],
    showResultToast: true,
  },
})

describe("automation generation normalization", () => {
  it("converts dynamic maps, preserves JSON null, and disarms triggers", () => {
    const result = normalizeAutomationGeneration(baseIr(), () => 42)
    expect(result).toMatchObject({
      ok: true,
      draft: {
        source: { kind: "imported", importedAt: 42 },
        triggers: [{ type: "urlMatch", disarmed: true }],
        vars: { status: { kind: "runtime" } },
        steps: [
          {
            op: "httpRequest",
            headers: {
              "X-Event-Type": "page-view",
              "X-Trace": "{{status}}",
            },
            body: { title: "{title}", optional: null },
            response: { statusToVar: "status" },
          },
        ],
        options: { showResultToast: true },
      },
    })
  })

  it("preserves JSON null in HTTP bodies nested under every parent shape", () => {
    const value = baseIr()
    value.script.triggers = [{ type: "manual", parameters: null }]
    const httpRequest = () => structuredClone(baseIr().script.steps[0])
    value.script.steps = [
      {
        op: "branch",
        id: null,
        description: null,
        if: { kind: "urlIncludes", value: "example" },
        then: [httpRequest()],
        else: null,
      },
      {
        op: "forEach",
        id: null,
        description: null,
        over: {
          elements: { strategy: "css", value: ".item", index: null },
        },
        as: null,
        maxIterations: null,
        steps: [httpRequest()],
      },
      {
        op: "showSurface",
        id: null,
        description: null,
        surfaceId: "nested-http",
        kind: "inline",
        urlMatch: null,
        placement: {
          selector: "#toolbar",
          index: null,
          position: "append",
        },
        content: {
          icon: null,
          title: null,
          text: "Send data",
          countdownTo: null,
        },
        actions: [
          {
            id: "send",
            label: "Send",
            icon: null,
            style: null,
            steps: [httpRequest()],
          },
        ],
      },
    ]

    const result = normalizeAutomationGeneration(value)

    expect(result).toMatchObject({
      ok: true,
      draft: {
        steps: [
          { then: [{ body: { title: "{title}", optional: null } }] },
          { steps: [{ body: { title: "{title}", optional: null } }] },
          {
            actions: [
              {
                steps: [{ body: { title: "{title}", optional: null } }],
              },
            ],
          },
        ],
      },
    })
  })

  it("rejects duplicate variables and case-insensitive header names", () => {
    const value = baseIr()
    value.script.variables.push({
      name: "status",
      definition: { kind: "literal", value: "duplicate" },
    })
    ;(value.script.steps[0].headers as unknown[]).push({
      name: "x-event-type",
      value: "text/plain",
    })

    const result = normalizeAutomationGeneration(value)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/duplicate variable/i)
      expect(result.errors.join(" ")).toMatch(/duplicate header/i)
    }
  })

  it("returns canonical semantic errors for invalid nested control flow", () => {
    const value = baseIr()
    value.script.triggers = [{ type: "manual", parameters: null }]
    value.script.steps = [
      {
        op: "branch",
        id: null,
        description: null,
        if: { kind: "urlIncludes", value: "example" },
        then: [
          {
            op: "navigate",
            id: null,
            description: null,
            url: "https://example.com",
          },
        ],
        else: null,
      },
    ]

    const result = normalizeAutomationGeneration(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/navigation/i)
  })
})
