import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getApiKey: vi.fn(),
  getSnippets: vi.fn(),
  request: vi.fn(),
  normalize: vi.fn(),
}))

vi.mock("../../commands/snippets", () => ({ getSnippets: mocks.getSnippets }))
vi.mock("./settings", () => ({
  getAutomationGenerationApiKey: mocks.getApiKey,
}))
vi.mock("./openai", () => ({ requestOpenAiAutomation: mocks.request }))
vi.mock("./normalize", () => ({
  normalizeAutomationGeneration: mocks.normalize,
}))

import { generateAutomationDraft } from "./service"

const ir = {
  note: "",
  script: {
    schemaVersion: 1,
    name: "Fixture",
    description: null,
    icon: null,
    color: null,
    enabled: true,
    urlRules: null,
    triggers: [{ type: "manual", parameters: null }],
    variables: [],
    steps: [],
    showResultToast: null,
  },
} as const

const draft = {
  schemaVersion: 1 as const,
  name: "Fixture",
  enabled: true,
  triggers: [{ type: "manual" as const }],
  steps: [{ op: "toast" as const, message: "Done" }],
}

beforeEach(() => {
  mocks.getApiKey.mockReset().mockResolvedValue("key")
  mocks.getSnippets.mockReset().mockResolvedValue([])
  mocks.request.mockReset().mockResolvedValue({ ok: true, ir })
  mocks.normalize.mockReset().mockReturnValue({ ok: true, draft })
})

describe("automation generation orchestration", () => {
  it("stops before context or fetch when no key is configured", async () => {
    mocks.getApiKey.mockResolvedValue(undefined)
    await expect(
      generateAutomationDraft({
        request: "fixture",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ ok: false, code: "missing-api-key" })
    expect(mocks.getSnippets).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("allows exactly one semantic repair and returns the repaired draft", async () => {
    mocks.normalize
      .mockReturnValueOnce({ ok: false, errors: ["steps.0: invalid"] })
      .mockReturnValueOnce({ ok: true, draft })

    await expect(
      generateAutomationDraft({
        request: "fixture",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ ok: true, draft, repaired: true })
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.request.mock.calls[1][0]).toMatchObject({
      repair: { previous: ir, errors: ["steps.0: invalid"] },
    })
    expect(mocks.normalize).toHaveBeenCalledTimes(2)
  })

  it("fails after the single repair remains semantically invalid", async () => {
    mocks.normalize.mockReturnValue({ ok: false, errors: ["still invalid"] })
    const result = await generateAutomationDraft({
      request: "fixture",
      signal: new AbortController().signal,
    })
    expect(result).toMatchObject({ ok: false, code: "invalid-output" })
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
})
