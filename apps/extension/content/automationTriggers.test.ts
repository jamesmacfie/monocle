// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AutomationPageTriggerSpec } from "../shared/types"

const mocks = vi.hoisted(() => ({
  sendRuntimeMessageSafe: vi.fn(),
  findElement: vi.fn(),
  spaCallback: undefined as (() => void) | undefined,
}))

vi.mock("../shared/utils/extension-api", () => ({
  sendRuntimeMessageSafe: mocks.sendRuntimeMessageSafe,
}))

vi.mock("./workflow/dom", () => ({
  findElement: mocks.findElement,
}))

vi.mock("./utils/spaNavigation", () => ({
  trackSpaNavigation: (callback: () => void) => {
    mocks.spaCallback = callback
    return () => {}
  },
}))

let observerCallback: MutationCallback

class FakeMutationObserver {
  constructor(callback: MutationCallback) {
    observerCallback = callback
  }

  observe() {}
  disconnect() {}
  takeRecords(): MutationRecord[] {
    return []
  }
}

const elementTrigger = (
  overrides: Partial<
    Extract<AutomationPageTriggerSpec["trigger"], { type: "elementAppears" }>
  > = {},
): AutomationPageTriggerSpec => ({
  automationId: "automation-1",
  trigger: {
    type: "elementAppears",
    selector: { strategy: "css", value: ".ready" },
    ...overrides,
  },
})

const arm = async (specs: AutomationPageTriggerSpec[]) => {
  mocks.sendRuntimeMessageSafe.mockImplementation(async (message) =>
    message.type === "monocle-automation-triggers-get"
      ? { triggers: specs }
      : {},
  )
  const { initializeAutomationTriggers } = await import("./automationTriggers")
  initializeAutomationTriggers()
  await vi.waitFor(() =>
    expect(mocks.sendRuntimeMessageSafe).toHaveBeenCalledWith(
      expect.objectContaining({ type: "monocle-automation-triggers-get" }),
    ),
  )
}

const firedMessages = () =>
  mocks.sendRuntimeMessageSafe.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === "monocle-automation-trigger-fired")

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(1000)
  mocks.sendRuntimeMessageSafe.mockReset()
  mocks.findElement.mockReset()
  mocks.spaCallback = undefined
  vi.stubGlobal("MutationObserver", FakeMutationObserver)
  window.history.replaceState({}, "", "/initial")
  Object.defineProperty(document, "readyState", {
    configurable: true,
    value: "complete",
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("automation trigger service", () => {
  it("fires a once-per-page element trigger only once", async () => {
    mocks.findElement.mockResolvedValue(
      Object.assign(document.createElement("div"), { textContent: "Ready" }),
    )
    await arm([elementTrigger({ oncePerPage: true })])
    await vi.waitFor(() => expect(firedMessages()).toHaveLength(1))

    observerCallback([], {} as MutationObserver)
    await Promise.resolve()

    expect(firedMessages()).toHaveLength(1)
    expect(mocks.findElement).toHaveBeenCalledTimes(1)
  })

  it("clamps element checks to the 250ms throttle floor", async () => {
    const checkTimes: number[] = []
    mocks.findElement.mockImplementation(async () => {
      checkTimes.push(Date.now())
      return document.createElement("div")
    })
    await arm([elementTrigger({ oncePerPage: false, throttleMs: 1 })])
    await vi.waitFor(() => expect(mocks.findElement).toHaveBeenCalledTimes(1))
    const firstCheckedAt = checkTimes[0]

    vi.setSystemTime(firstCheckedAt + 249)
    observerCallback([], {} as MutationObserver)
    await Promise.resolve()
    expect(mocks.findElement).toHaveBeenCalledTimes(1)

    vi.setSystemTime(firstCheckedAt + 250)
    observerCallback([], {} as MutationObserver)
    await vi.waitFor(() => expect(mocks.findElement).toHaveBeenCalledTimes(2))
  })

  it("re-arms once-per-page element triggers after SPA navigation", async () => {
    mocks.findElement.mockResolvedValue(document.createElement("div"))
    await arm([elementTrigger({ oncePerPage: true })])
    await vi.waitFor(() => expect(firedMessages()).toHaveLength(1))

    window.history.pushState({}, "", "/next")
    mocks.spaCallback?.()

    await vi.waitFor(() => expect(firedMessages()).toHaveLength(2))
    expect(mocks.findElement).toHaveBeenCalledTimes(2)
  })
})
