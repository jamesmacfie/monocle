// Architecture: background tests. Engine behavior
// (background/automations/engine.ts) with the workflow/tab boundary mocked:
// segmentation around engine ops and getText, var threading into later
// segments, branch evaluation via probes, forEach retargeting + loop scope,
// runCommand policy enforcement through the injected bridge, and the
// concurrent-run guard. The content executor itself is covered by
// content/workflow tests; here every lowered segment is intercepted.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type {
  Step,
  Workflow,
  WorkflowResult,
} from "../../shared/types/workflow"

const executeWorkflowMock = vi.fn()
const sendTabMessageMock = vi.fn()
const ensureHostPermissionMock = vi.fn()
const hostPermissionPatternForUrlMock = vi.fn()
const openHostPermissionGrantPageMock = vi.fn()
let currentTab: { id: number; url: string; title: string }

vi.mock("../workflows/execution", () => ({
  executeWorkflowOnTargetTab: (input: { workflow: Workflow }) =>
    executeWorkflowMock(input),
  resolveWorkflowTargetTabId: async () => 7,
}))

vi.mock("../utils/browser", () => ({
  sendTabMessage: (tabId: number, message: unknown) =>
    sendTabMessageMock(tabId, message),
}))

vi.mock("../utils/hostPermissions", () => ({
  ensureHostPermission: (input: unknown) => ensureHostPermissionMock(input),
  hostPermissionPatternForUrl: (url: string) =>
    hostPermissionPatternForUrlMock(url),
  openHostPermissionGrantPage: (input: unknown) =>
    openHostPermissionGrantPageMock(input),
}))

import { addSnippet, getSnippet } from "../commands/snippets"
import { getSurfacesForUrl } from "../surfaces"
import {
  registerAutomationCommandBridge,
  runAutomation,
  runAutomationSurfaceAction,
} from "./engine"
import { addAutomation, updateAutomation } from "./storage"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      lastError: null,
    },
    tabs: {
      query: vi.fn((_query: unknown, callback: (tabs: unknown[]) => void) =>
        callback([]),
      ),
      sendMessage: vi.fn(
        (
          _tabId: number,
          _message: unknown,
          callback: (response?: unknown) => void,
        ) => callback(undefined),
      ),
    },
  })
}

const context = {
  url: "https://dev.example.com",
  title: "Dev",
  modifierKey: null,
}

// Default: every workflow succeeds; getText steps return canned vars.
const succeedWorkflows =
  (
    vars: Record<string, string> = {},
  ): ((input: {
    workflow: Workflow
  }) => Promise<{ tabId: number; result: WorkflowResult }>) =>
  async ({ workflow }) => ({
    tabId: 7,
    result: {
      success: true,
      stepResults: workflow.steps.map((step: Step) => ({
        stepId: step.id,
        success: true,
      })),
      vars,
    },
  })

beforeEach(() => {
  fakeBrowser.reset()
  installBrowserStubs()
  currentTab = { id: 7, url: context.url, title: context.title }
  ;(fakeBrowser as unknown as { tabs: unknown }).tabs = {
    ...fakeBrowser.tabs,
    get: vi.fn(async () => currentTab),
    update: vi.fn(async (tabId: number, updateProperties: { url?: string }) => {
      if (updateProperties.url) {
        currentTab = {
          ...currentTab,
          id: tabId,
          url: updateProperties.url,
        }
        setTimeout(() => {
          fakeBrowser.tabs.onUpdated.trigger(
            tabId,
            { status: "complete" },
            {} as never,
          )
        }, 0)
      }
      return currentTab
    }),
  }
  executeWorkflowMock.mockReset()
  sendTabMessageMock.mockReset().mockResolvedValue({ received: true })
  ensureHostPermissionMock.mockReset().mockResolvedValue({
    granted: true,
    originPattern: "https://dev.example.com/*",
  })
  openHostPermissionGrantPageMock.mockReset().mockResolvedValue({
    granted: false,
    originPattern: "https://dev.example.com/*",
  })
  hostPermissionPatternForUrlMock.mockReset().mockImplementation((url) => {
    if (!/^https?:\/\//.test(url)) {
      return { ok: false, error: "not a web page" }
    }
    const parsed = new URL(url)
    return {
      ok: true,
      originPattern: `${parsed.protocol}//${parsed.hostname}/*`,
    }
  })
  registerAutomationCommandBridge({
    resolveCommandMeta: async (commandId) => ({
      exists: commandId !== "missing-command",
      confirmAction: commandId === "confirm-command",
    }),
    executeCommand: async () => undefined,
  })
})

describe("engine segmentation and interpolation", () => {
  it("runs contiguous content steps as one segment with interpolated fill text", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Login",
      enabled: true,
      triggers: [{ type: "manual" }],
      vars: { user: { kind: "literal", value: "james" } },
      steps: [
        {
          op: "fill",
          target: { strategy: "css", value: "#u" },
          text: "{{user}}",
        },
        { op: "click", target: { strategy: "text", value: "Sign in" } },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(result.completedSteps).toBe(2)
    // One segment: both content steps batched into a single workflow.
    expect(executeWorkflowMock).toHaveBeenCalledTimes(1)
    const workflow = executeWorkflowMock.mock.calls[0][0].workflow as Workflow
    expect(workflow.steps).toHaveLength(2)
    expect(workflow.steps[0]).toMatchObject({ op: "fill", text: "james" })
  })

  it("splits segments after getText and threads extracted vars onward", async () => {
    let call = 0
    executeWorkflowMock.mockImplementation(async ({ workflow }) => {
      call += 1
      return {
        tabId: 7,
        result: {
          success: true,
          stepResults: workflow.steps.map(() => ({ success: true })),
          vars: call === 1 ? { heading: "Welcome" } : {},
        },
      }
    })

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Read then fill",
      enabled: true,
      triggers: [{ type: "manual" }],
      steps: [
        {
          op: "getText",
          from: { strategy: "css", value: "h1" },
          toVar: "heading",
        },
        {
          op: "fill",
          target: { strategy: "css", value: "#out" },
          text: "{{heading}}!",
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(executeWorkflowMock).toHaveBeenCalledTimes(2)
    const second = executeWorkflowMock.mock.calls[1][0].workflow as Workflow
    expect(second.steps[0]).toMatchObject({ op: "fill", text: "Welcome!" })
  })

  it("evaluates branches via probes and runs only the matching arm", async () => {
    executeWorkflowMock.mockImplementation(async ({ workflow }) => {
      const [step] = workflow.steps as Step[]
      // The probe: elementExists -> wait/attached; report found.
      if (step.op === "wait" && "for" in step && "selector" in step.for) {
        return { tabId: 7, result: { success: true } }
      }
      return {
        tabId: 7,
        result: {
          success: true,
          stepResults: workflow.steps.map(() => ({ success: true })),
        },
      }
    })

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Conditional click",
      enabled: true,
      triggers: [{ type: "manual" }],
      steps: [
        {
          op: "branch",
          if: {
            kind: "elementExists",
            selector: { strategy: "css", value: ".banner" },
          },
          then: [
            { op: "click", target: { strategy: "css", value: ".banner" } },
          ],
          else: [{ op: "toast", message: "no banner" }],
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    // The then-arm click ran as a content segment; the else-arm toast never
    // reached the tab.
    const clicked = executeWorkflowMock.mock.calls.some(
      ([input]) => (input.workflow as Workflow).steps[0]?.op === "click",
    )
    expect(clicked).toBe(true)
    expect(
      sendTabMessageMock.mock.calls.some(
        ([, message]) =>
          (message as { type?: string }).type === "monocle-toast" &&
          (message as { message?: string }).message === "no banner",
      ),
    ).toBe(false)
  })

  it("stops on the first failed step and reports the failure", async () => {
    executeWorkflowMock.mockImplementation(async ({ workflow }) => ({
      tabId: 7,
      result: {
        success: false,
        error: "Step click failed: Could not find element",
        stepResults: workflow.steps.map(() => ({
          success: false,
          error: "Could not find element",
        })),
      },
    }))

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Broken",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [{ op: "click", target: { strategy: "css", value: "#missing" } }],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Could not find element/)
  })
})

describe("host access", () => {
  it("requests current-page host access before manual content workflows", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Fill field",
      enabled: true,
      triggers: [{ type: "manual" }],
      steps: [
        {
          op: "fill",
          target: { strategy: "css", value: "#email" },
          text: "test@example.com",
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(ensureHostPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 7,
        url: context.url,
        reason: "automation",
        request: false,
        ensureContentScript: true,
      }),
    )
    expect(openHostPermissionGrantPageMock).not.toHaveBeenCalled()
  })

  it("fails before workflow delivery when manual host access is denied", async () => {
    ensureHostPermissionMock.mockResolvedValueOnce({
      granted: false,
      originPattern: "https://dev.example.com/*",
    })

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Denied",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "click",
          target: { strategy: "css", value: "#go" },
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Grant site access/)
    expect(result.error).toMatch(/opened Monocle tab/)
    expect(openHostPermissionGrantPageMock).toHaveBeenCalledWith({
      tabId: 7,
      url: context.url,
      reason: "automation",
    })
    expect(executeWorkflowMock).not.toHaveBeenCalled()
  })

  it("attributes denied host access to the engine step", async () => {
    ensureHostPermissionMock.mockResolvedValueOnce({
      granted: false,
      originPattern: "https://dev.example.com/*",
    })

    const automation = await addAutomation({
      schemaVersion: 1,
      name: "Denied clipboard",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [{ op: "clipboardWrite", text: "value" }],
    })

    const result = await runAutomation(automation.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(false)
    expect(result.stepOutcomes).toEqual([
      expect.objectContaining({
        op: "clipboardWrite",
        success: false,
        error: expect.stringMatching(/Grant site access/),
      }),
    ])
  })

  it("checks but does not request host access for non-manual triggers", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Trigger fill",
      enabled: true,
      triggers: [{ type: "urlMatch" }],
      steps: [
        {
          op: "fill",
          target: { strategy: "css", value: "#email" },
          text: "test@example.com",
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: {
        kind: "trigger",
        tabId: 7,
        trigger: { type: "urlMatch", url: context.url },
      },
    })

    expect(result.success).toBe(true)
    expect(ensureHostPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        request: false,
        ensureContentScript: true,
      }),
    )
  })

  it("preflights known same-tab navigation destinations before navigating", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Navigate then fill",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        { op: "navigate", url: "https://next.example.com/onboarding" },
        {
          op: "fill",
          target: { strategy: "css", value: "#name" },
          text: "{url}",
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(ensureHostPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://next.example.com/onboarding",
        request: false,
        ensureContentScript: false,
      }),
    )
    const workflow = executeWorkflowMock.mock.calls[0][0].workflow as Workflow
    expect(workflow.steps[0]).toMatchObject({
      op: "fill",
      text: "https://next.example.com/onboarding",
    })
  })
})

describe("engine ops and policy", () => {
  it("enforces the runCommand policy at execute time", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Recursive",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [{ op: "runCommand", commandId: "automation-other" }],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cannot run other automations/i)
  })

  it("sends toasts and clipboard writes through tab messages", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Clip",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        { op: "clipboardWrite", text: "value {{trigger.type}}" },
        { op: "toast", level: "success", message: "Copied!" },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
      type: "monocle-clipboard-write",
      message: "value manual",
    })
    expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
      type: "monocle-toast",
      level: "success",
      message: "Copied!",
    })
  })

  it("refuses disabled scripts", async () => {
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Off",
      enabled: false,
      triggers: [{ type: "manual" }],
      steps: [{ op: "wait", for: { timeMs: 1 } }],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/disabled/)
  })

  it("applies non-manual cooldown per tab, not globally per script", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Auto hide",
      enabled: true,
      triggers: [{ type: "urlMatch" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "hideElement",
          target: { strategy: "css", value: ".ad" },
          all: true,
        },
      ],
    })

    const first = await runAutomation(script.id, {
      context,
      invocation: {
        kind: "trigger",
        tabId: 7,
        trigger: { type: "urlMatch", url: context.url },
      },
    })
    const secondSameTab = await runAutomation(script.id, {
      context,
      invocation: {
        kind: "trigger",
        tabId: 7,
        trigger: { type: "urlMatch", url: context.url },
      },
    })
    const thirdOtherTab = await runAutomation(script.id, {
      context,
      invocation: {
        kind: "trigger",
        tabId: 8,
        trigger: { type: "urlMatch", url: context.url },
      },
    })

    expect(first.success).toBe(true)
    expect(secondSameTab.success).toBe(false)
    expect(secondSameTab.error).toMatch(/cooling down/)
    expect(thirdOtherTab.success).toBe(true)
  })
})

describe("expectNavigation segments", () => {
  it("waits for the page to load, refreshes page context, then runs the next segment", async () => {
    let call = 0
    executeWorkflowMock.mockImplementation(async ({ workflow }) => {
      call += 1
      if (call === 1) {
        queueMicrotask(() => {
          currentTab = {
            id: 7,
            url: "https://dev.example.com/step-two",
            title: "Step two",
          }
          fakeBrowser.tabs.onUpdated.trigger(
            7,
            { status: "complete" },
            {} as never,
          )
        })
      }
      return {
        tabId: 7,
        result: {
          success: true,
          stepResults: workflow.steps.map((step: Step) => ({
            stepId: step.id,
            success: true,
          })),
        },
      }
    })

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Two-step signup",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "click",
          target: { strategy: "text", value: "Continue" },
          expectNavigation: true,
        },
        {
          op: "fill",
          target: { strategy: "css", value: "#code" },
          text: "{url}",
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(executeWorkflowMock).toHaveBeenCalledTimes(2)
    const first = executeWorkflowMock.mock.calls[0][0].workflow as Workflow
    const second = executeWorkflowMock.mock.calls[1][0].workflow as Workflow
    expect(first.steps).toHaveLength(1)
    expect(first.steps[0]).toMatchObject({ op: "click" })
    expect(first.steps[0]).not.toHaveProperty("expectNavigation")
    expect(second.steps[0]).toMatchObject({
      op: "fill",
      text: "https://dev.example.com/step-two",
    })
  })

  it("tolerates a lost response only when navigation is observed", async () => {
    executeWorkflowMock.mockImplementation(async () => {
      queueMicrotask(() =>
        fakeBrowser.tabs.onUpdated.trigger(
          7,
          { status: "complete" },
          {} as never,
        ),
      )
      throw new Error("The message port closed before a response")
    })

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Submit then continue",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "submit",
          target: { strategy: "css", value: "form" },
          expectNavigation: true,
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(result.stepOutcomes?.[0]).toMatchObject({
      op: "submit",
      success: true,
    })
  })

  it("does not hide a lost response when no navigation starts", async () => {
    vi.useFakeTimers()
    try {
      executeWorkflowMock.mockRejectedValue(
        new Error("The message port closed before a response"),
      )

      const script = await addAutomation({
        schemaVersion: 1,
        name: "No navigation",
        enabled: true,
        triggers: [{ type: "manual" }],
        options: { showResultToast: false },
        steps: [
          {
            op: "click",
            target: { strategy: "css", value: "#noop" },
            expectNavigation: true,
          },
        ],
      })

      const runPromise = runAutomation(script.id, {
        context,
        invocation: { kind: "manual" },
      })

      await vi.advanceTimersByTimeAsync(2000)
      const result = await runPromise

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/message port closed/i)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("forEach over elements", () => {
  it("iterates matches, pins selectors per index, and binds {{item}}/{{index}}", async () => {
    const MATCH_COUNT = 2

    executeWorkflowMock.mockImplementation(async ({ workflow }) => {
      const [step] = workflow.steps as Step[]

      // Existence probe: wait/attached on .row with index — succeed for the
      // first MATCH_COUNT indices.
      if (step.op === "wait" && "for" in step && "selector" in step.for) {
        const index = (step.for.selector as { index?: number }).index ?? 0
        return { tabId: 7, result: { success: index < MATCH_COUNT } }
      }

      // Item-text probe.
      if (step.op === "getText" && step.toVar === "__monocleLoopItem") {
        const index = (step.from as { index?: number }).index ?? 0
        return {
          tabId: 7,
          result: {
            success: true,
            vars: { __monocleLoopItem: `Row ${index}` },
          },
        }
      }

      return {
        tabId: 7,
        result: {
          success: true,
          stepResults: workflow.steps.map(() => ({ success: true })),
        },
      }
    })

    const script = await addAutomation({
      schemaVersion: 1,
      name: "Loop",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "forEach",
          over: { elements: { strategy: "css", value: ".row" } },
          steps: [
            { op: "click", target: { strategy: "css", value: ".row" } },
            { op: "clipboardWrite", text: "{{item}}@{{index}}" },
          ],
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)

    // Body clicks were pinned to each iteration's index.
    const clickIndices = executeWorkflowMock.mock.calls
      .map(([input]) => (input.workflow as Workflow).steps[0])
      .filter((step: Step) => step.op === "click")
      .map(
        (step: Step) => (step as { target: { index?: number } }).target.index,
      )
    expect(clickIndices).toEqual([0, 1])

    // Loop scope reached templates.
    const clipboardWrites = sendTabMessageMock.mock.calls
      .map(([, message]) => message as { type?: string; message?: string })
      .filter((message) => message.type === "monocle-clipboard-write")
      .map((message) => message.message)
    expect(clipboardWrites).toEqual(["Row 0@0", "Row 1@1"])
  })
})

describe("loop limits and variable iteration", () => {
  it("stops a while loop at its requested iteration cap", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Bounded while",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "while",
          condition: { kind: "urlIncludes", value: "dev.example.com" },
          maxIterations: 3,
          steps: [{ op: "setVariable", name: "seen", value: "{{index}}" }],
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result).toMatchObject({ success: true, completedSteps: 4 })
    expect(result.stepOutcomes?.map(({ op }) => op)).toEqual([
      "while",
      "setVariable",
      "setVariable",
      "setVariable",
    ])
  })

  it("iterates newline-delimited values from a variable", async () => {
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Variable loop",
      enabled: true,
      triggers: [{ type: "manual" }],
      vars: { rows: { kind: "literal", value: "alpha\nbeta" } },
      options: { showResultToast: false },
      steps: [
        {
          op: "forEach",
          over: { variable: "rows" },
          as: "row",
          steps: [{ op: "clipboardWrite", text: "{{row}}:{{index}}" }],
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(
      sendTabMessageMock.mock.calls
        .map(([, message]) => message as { type?: string; message?: string })
        .filter(({ type }) => type === "monocle-clipboard-write")
        .map(({ message }) => message),
    ).toEqual(["alpha:0", "beta:1"])
  })

  it("enforces the total runtime step cap inside a legal loop document", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())
    const body = Array.from({ length: 5 }, (_, index) => ({
      op: "setVariable" as const,
      name: `value${index}`,
      value: "{{index}}",
    }))
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Runtime cap",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "while",
          condition: { kind: "urlIncludes", value: "dev.example.com" },
          maxIterations: 1000,
          steps: body,
        },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/5000-step runtime cap/)
    expect(result.completedSteps).toBe(5001)
  })
})

describe("snippet and surface engine ops", () => {
  it("inserts snippets through target and focused-input paths, bumping each counter once", async () => {
    executeWorkflowMock.mockImplementation(succeedWorkflows())
    sendTabMessageMock.mockImplementation(async (_tabId, message) =>
      (message as { type?: string }).type === "monocle-text-insert"
        ? { inserted: true }
        : { received: true },
    )
    const targetSnippet = await addSnippet({ name: "Target", body: "T{i}" })
    const focusedSnippet = await addSnippet({ name: "Focused", body: "F{i}" })
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Insert snippets",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "insertSnippet",
          snippetId: targetSnippet.id,
          target: { strategy: "css", value: "#target" },
        },
        { op: "insertSnippet", snippetId: focusedSnippet.id },
      ],
    })

    const result = await runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })

    expect(result.success).toBe(true)
    expect(
      (executeWorkflowMock.mock.calls[0][0].workflow as Workflow).steps[0],
    ).toMatchObject({ op: "fill", text: "T1" })
    expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
      type: "monocle-text-insert",
      text: "F1",
    })
    await expect(getSnippet(targetSnippet.id)).resolves.toMatchObject({
      insertCounter: 1,
    })
    await expect(getSnippet(focusedSnippet.id)).resolves.toMatchObject({
      insertCounter: 1,
    })
  })

  it("shows and then hides an automation-owned surface", async () => {
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Surface lifecycle",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [
        {
          op: "showSurface",
          surfaceId: "status",
          kind: "badge",
          content: { text: "Running" },
        },
      ],
    })

    expect(
      await runAutomation(script.id, {
        context,
        invocation: { kind: "manual" },
      }),
    ).toMatchObject({ success: true })
    expect(await getSurfacesForUrl(context.url)).toContainEqual(
      expect.objectContaining({
        ownerId: `automation:${script.id}`,
        id: "status",
      }),
    )

    await updateAutomation(script.id, {
      schemaVersion: 1,
      name: script.name,
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [{ op: "hideSurface", surfaceId: "status" }],
    })
    expect(
      await runAutomation(script.id, {
        context,
        invocation: { kind: "manual" },
      }),
    ).toMatchObject({ success: true })
    expect(await getSurfacesForUrl(context.url)).toHaveLength(0)
  })

  it("projects inline metadata only and runs the current action with fresh values", async () => {
    const base = {
      schemaVersion: 1 as const,
      name: "Inline action",
      enabled: true,
      triggers: [{ type: "manual" as const }],
      vars: { value: { kind: "literal" as const, value: "first" } },
      options: { showResultToast: false },
      steps: [
        {
          op: "showSurface" as const,
          surfaceId: "open-ide",
          kind: "inline" as const,
          placement: { selector: "#header", position: "after" as const },
          content: { text: "IDE" },
          actions: [
            {
              id: "open",
              label: "Open",
              steps: [
                {
                  op: "toast" as const,
                  message:
                    "{{value}}/{{trigger.surfaceId}}/{{trigger.actionId}}",
                },
              ],
            },
          ],
        },
      ],
    }
    const script = await addAutomation(base)
    await runAutomation(script.id, { context, invocation: { kind: "manual" } })
    const [stored] = await getSurfacesForUrl(context.url)
    expect(stored.actions).toEqual([{ id: "open", label: "Open" }])
    expect(JSON.stringify(stored)).not.toContain('"steps"')

    await updateAutomation(script.id, {
      ...base,
      vars: { value: { kind: "literal", value: "second" } },
    })
    sendTabMessageMock.mockClear()
    const result = await runAutomationSurfaceAction(script.id, {
      surfaceId: "open-ide",
      actionId: "open",
      tabId: 7,
      context,
    })
    expect(result).toMatchObject({ success: true, completedSteps: 1 })
    expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
      type: "monocle-toast",
      level: "info",
      message: "second/open-ide/open",
    })
  })
})

describe("runtime safety gates", () => {
  it("drops a second run while the same automation is active on the tab", async () => {
    let resolveWorkflow:
      | ((value: { tabId: number; result: WorkflowResult }) => void)
      | undefined
    executeWorkflowMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorkflow = resolve
        }),
    )
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Concurrent",
      enabled: true,
      triggers: [{ type: "manual" }],
      options: { showResultToast: false },
      steps: [{ op: "wait", for: { timeMs: 1 } }],
    })

    const firstRun = runAutomation(script.id, {
      context,
      invocation: { kind: "manual" },
    })
    await vi.waitFor(() => expect(executeWorkflowMock).toHaveBeenCalledTimes(1))

    await expect(
      runAutomation(script.id, {
        context,
        invocation: { kind: "manual" },
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/already running/),
    })

    resolveWorkflow?.({
      tabId: 7,
      result: { success: true, stepResults: [{ success: true }] },
    })
    await expect(firstRun).resolves.toMatchObject({ success: true })
  })

  it("refuses a structurally invalid document written directly to storage", async () => {
    const tampered = {
      id: "tampered",
      schemaVersion: 1,
      name: "Tampered",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      triggers: [{ type: "manual" }],
      steps: [
        {
          op: "branch",
          if: { kind: "urlIncludes", value: "example.com" },
          then: [{ op: "navigate", url: "https://example.com" }],
        },
      ],
    }
    await fakeBrowser.storage.local.set({
      "monocle-automations": [tampered],
    })

    await expect(
      runAutomation("tampered", {
        context,
        invocation: { kind: "manual" },
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/failed structural checks/),
    })
    expect(executeWorkflowMock).not.toHaveBeenCalled()
  })
})
