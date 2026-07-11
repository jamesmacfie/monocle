import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  contains: vi.fn(),
  generateDraft: vi.fn(),
  consent: vi.fn(),
}))

vi.mock("../../shared/utils/browser", () => ({ isFirefox: false }))
vi.mock("../../shared/utils/extension-api", () => ({
  getBrowserAPI: () => ({ permissions: { contains: mocks.contains } }),
}))
vi.mock("../automations/generation/service", () => ({
  generateAutomationDraft: mocks.generateDraft,
}))
vi.mock("../automations/outboundDataConsent", () => ({
  hasOutboundDataConsent: mocks.consent,
}))

import {
  cancelAutomationGeneration,
  generateAutomationMessage,
} from "./automationGeneration"

beforeEach(() => {
  mocks.contains.mockReset().mockResolvedValue(true)
  mocks.generateDraft.mockReset().mockResolvedValue({
    ok: false,
    code: "service-error",
    message: "fixture",
    retryable: true,
  })
  mocks.consent.mockReset().mockResolvedValue(true)
})

describe("automation generation message boundary", () => {
  it("rechecks concrete origin permission before generation", async () => {
    mocks.contains.mockResolvedValue(false)
    await expect(
      generateAutomationMessage({
        type: "monocle-automation-generate",
        generationId: "permission-test",
        request: "do something",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission-denied" })
    expect(mocks.generateDraft).not.toHaveBeenCalled()
  })

  it("enforces one active generation and cancels by id", async () => {
    mocks.generateDraft.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () =>
            resolve({
              ok: false,
              code: "cancelled",
              message: "cancelled",
              retryable: false,
            }),
          )
        }),
    )
    const first = generateAutomationMessage({
      type: "monocle-automation-generate",
      generationId: "first",
      request: "first",
    })
    await vi.waitFor(() => expect(mocks.generateDraft).toHaveBeenCalledOnce())

    await expect(
      generateAutomationMessage({
        type: "monocle-automation-generate",
        generationId: "second",
        request: "second",
      }),
    ).resolves.toMatchObject({ ok: false, code: "busy" })
    await expect(
      cancelAutomationGeneration({
        type: "monocle-automation-generation-cancel",
        generationId: "first",
      }),
    ).resolves.toEqual({ cancelled: true })
    await expect(first).resolves.toMatchObject({ ok: false, code: "cancelled" })

    mocks.generateDraft.mockResolvedValueOnce({
      ok: false,
      code: "network",
      message: "offline",
      retryable: true,
    })
    await expect(
      generateAutomationMessage({
        type: "monocle-automation-generate",
        generationId: "after-cleanup",
        request: "again",
      }),
    ).resolves.toMatchObject({ ok: false, code: "network" })
  })
})
