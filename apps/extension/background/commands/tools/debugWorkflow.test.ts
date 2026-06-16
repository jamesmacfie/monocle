import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Browser } from "../../../shared/types"
import type { WorkflowResult } from "../../../shared/types/workflow"

const context: Browser.Context = {
  url: "https://example.com/form",
  title: "Form",
  modifierKey: null,
}

type SentMessage = {
  tabId: number
  message: any
}

let workflowResult: WorkflowResult
let sentMessages: SentMessage[]

const installChromeStubs = () => {
  const tabs = [
    {
      id: 11,
      url: context.url,
      active: false,
      currentWindow: true,
    },
    {
      id: 12,
      url: "https://other.example.com/",
      active: true,
      currentWindow: true,
    },
  ]

  vi.stubGlobal("browser", undefined)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    tabs: {
      query: vi.fn(
        (queryInfo: Record<string, unknown>, callback?: Function) => {
          const result = queryInfo.active
            ? tabs.filter((tab) => tab.active)
            : tabs
          callback?.(result)
          return Promise.resolve(result)
        },
      ),
      sendMessage: vi.fn((tabId: number, message: any, callback?: Function) => {
        sentMessages.push({ tabId, message })
        const response =
          message.type === "execute-workflow-content"
            ? { result: workflowResult }
            : { received: true }
        callback?.(response)
        return Promise.resolve(response)
      }),
    },
  })
}

const runDebugWorkflow = async () => {
  vi.useFakeTimers()
  const { debugWorkflow } = await import("./debugWorkflow")
  const promise = debugWorkflow.execute?.(context)
  await vi.advanceTimersByTimeAsync(200)
  await promise
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  workflowResult = { success: true }
  sentMessages = []
  installChromeStubs()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("debug workflow command", () => {
  it("shows a targeted success toast when the content workflow succeeds", async () => {
    workflowResult = { success: true }

    await runDebugWorkflow()

    expect(sentMessages.map((message) => message.message.type)).toEqual([
      "toggle-ui",
      "execute-workflow-content",
      "monocle-toast",
    ])
    expect(sentMessages.every((message) => message.tabId === 11)).toBe(true)
    expect(sentMessages.at(-1)?.message).toMatchObject({
      type: "monocle-toast",
      level: "success",
      message: expect.stringContaining("Debug workflow clicked"),
    })
  })

  it("surfaces missing-target workflow failures as targeted error toasts", async () => {
    workflowResult = {
      success: false,
      error: "Could not find element for selector",
    }

    await runDebugWorkflow()

    expect(sentMessages.map((message) => message.message.type)).toEqual([
      "toggle-ui",
      "execute-workflow-content",
      "monocle-toast",
    ])
    expect(sentMessages.every((message) => message.tabId === 11)).toBe(true)
    expect(sentMessages.at(-1)?.message).toMatchObject({
      type: "monocle-toast",
      level: "error",
      message: expect.stringContaining("Could not find element"),
    })
  })
})
