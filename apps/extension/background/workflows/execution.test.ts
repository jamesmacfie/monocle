import { describe, expect, it, vi } from "vitest"
import type { Browser } from "../../shared/types"
import type { Workflow } from "../../shared/types/workflow"
import {
  executeWorkflowOnTargetTab,
  resolveWorkflowTargetTabId,
  unwrapWorkflowResult,
} from "./execution"

const context: Browser.Context = {
  url: "https://example.com/workflow-target",
  title: "Target",
  modifierKey: null,
}

const workflow: Workflow = {
  version: "1.0",
  steps: [
    {
      op: "wait",
      for: { timeMs: 1 },
    },
  ],
}

describe("workflow target routing", () => {
  it("uses explicit tab ids before sender or active-tab fallbacks", async () => {
    await expect(
      resolveWorkflowTargetTabId({
        tabId: 9,
        sender: { tab: { id: 3 } },
        deps: {
          getActiveTab: vi.fn(async () => ({ id: 1 })),
        },
      }),
    ).resolves.toBe(9)
  })

  it("uses sender tab ids for content-originated workflow messages", async () => {
    await expect(
      resolveWorkflowTargetTabId({
        sender: { tab: { id: 7 } },
      }),
    ).resolves.toBe(7)
  })

  it("matches the context URL when focus changes before execution", async () => {
    const queryTabs = vi.fn(async () => [
      {
        id: 1,
        url: "https://other.example.com/",
        active: true,
        currentWindow: true,
      },
      {
        id: 2,
        url: "https://example.com/workflow-target",
        active: false,
        currentWindow: true,
      },
    ])
    const getActiveTab = vi.fn(async () => ({ id: 1 }))
    const sendTabMessage = vi.fn(async () => ({
      result: { success: true },
    }))

    await expect(
      executeWorkflowOnTargetTab({
        workflow,
        context,
        deps: {
          queryTabs,
          getActiveTab,
          sendTabMessage,
        },
      }),
    ).resolves.toEqual({
      tabId: 2,
      result: { success: true },
    })

    expect(sendTabMessage).toHaveBeenCalledWith(2, {
      type: "monocle-workflow-content-execute",
      workflow,
      context,
    })
    expect(getActiveTab).not.toHaveBeenCalled()
  })

  it("fails clearly when a context URL no longer maps to a tab", async () => {
    await expect(
      resolveWorkflowTargetTabId({
        context,
        deps: {
          queryTabs: vi.fn(async () => []),
        },
      }),
    ).rejects.toThrow("No tab found for workflow context URL")
  })

  it("does not send invalid internal workflows to content", async () => {
    const sendTabMessage = vi.fn()

    await expect(
      executeWorkflowOnTargetTab({
        workflow: {
          version: "1.0",
          steps: [{ op: "not-real" }],
        } as unknown as Workflow,
        context,
        tabId: 4,
        deps: {
          sendTabMessage,
        },
      }),
    ).resolves.toMatchObject({
      tabId: 4,
      result: {
        success: false,
      },
    })

    expect(sendTabMessage).not.toHaveBeenCalled()
  })

  it("retries workflow delivery while the content listener is not ready", async () => {
    vi.useFakeTimers()
    try {
      const sendTabMessage = vi
        .fn()
        .mockRejectedValueOnce(new Error("Receiving end does not exist"))
        .mockRejectedValueOnce(new Error("Could not establish connection"))
        .mockResolvedValueOnce({ result: { success: true } })

      const runPromise = executeWorkflowOnTargetTab({
        workflow,
        context,
        tabId: 4,
        deps: {
          sendTabMessage,
        },
      })

      await vi.advanceTimersByTimeAsync(75)
      await vi.advanceTimersByTimeAsync(75)

      await expect(runPromise).resolves.toEqual({
        tabId: 4,
        result: { success: true },
      })
      expect(sendTabMessage).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not retry port-closed workflow delivery errors", async () => {
    const sendTabMessage = vi.fn(async () => {
      throw new Error("The message port closed before a response was received")
    })

    await expect(
      executeWorkflowOnTargetTab({
        workflow,
        context,
        tabId: 4,
        deps: {
          sendTabMessage,
        },
      }),
    ).rejects.toThrow(/message port closed/i)

    expect(sendTabMessage).toHaveBeenCalledTimes(1)
  })

  it("unwraps malformed content responses as workflow failures", () => {
    expect(unwrapWorkflowResult({ received: true })).toEqual({
      success: false,
      error: "Workflow execution returned an invalid result",
    })

    expect(unwrapWorkflowResult(true)).toEqual({
      success: false,
      error: "Workflow execution returned an invalid result",
    })
  })
})
