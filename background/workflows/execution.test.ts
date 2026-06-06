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
      type: "execute-workflow-content",
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
