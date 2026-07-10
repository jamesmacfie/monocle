import { afterEach, describe, expect, it, vi } from "vitest"
import type { Workflow } from "../../shared/types/workflow"
import { WorkflowExecutor } from "./executor"
import { installDom } from "./testDom"

const runWorkflow = (workflow: Workflow) => {
  return new WorkflowExecutor().executeWorkflow(workflow)
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("WorkflowExecutor retry policy", () => {
  it("retries until success and stops after the final failure", async () => {
    const executor = new WorkflowExecutor()
    const executeStep = vi
      .spyOn(
        executor as unknown as { executeStep: () => Promise<unknown> },
        "executeStep",
      )
      .mockResolvedValueOnce({ success: false, error: "first" })
      .mockResolvedValueOnce({ success: true })

    await expect(
      executor.executeWorkflow({
        version: "1.0",
        steps: [{ op: "wait", for: { timeMs: 0 }, retry: { retries: 2 } }],
      }),
    ).resolves.toMatchObject({ success: true })
    expect(executeStep).toHaveBeenCalledTimes(2)

    executeStep.mockReset().mockResolvedValue({
      success: false,
      error: "still failing",
    })
    await expect(
      executor.executeWorkflow({
        version: "1.0",
        steps: [{ op: "wait", for: { timeMs: 0 }, retry: { retries: 2 } }],
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("still failing"),
    })
    expect(executeStep).toHaveBeenCalledTimes(3)
  })

  it("doubles exponential retry delays", async () => {
    vi.useFakeTimers()
    const executor = new WorkflowExecutor()
    const executeStep = vi
      .spyOn(
        executor as unknown as { executeStep: () => Promise<unknown> },
        "executeStep",
      )
      .mockResolvedValueOnce({ success: false, error: "first" })
      .mockResolvedValueOnce({ success: false, error: "second" })
      .mockResolvedValueOnce({ success: true })

    const promise = executor.executeWorkflow({
      version: "1.0",
      steps: [
        {
          op: "wait",
          for: { timeMs: 0 },
          retry: { retries: 2, delayMs: 100, backoff: "exponential" },
        },
      ],
    })
    await Promise.resolve()
    expect(executeStep).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(executeStep).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(199)
    expect(executeStep).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toMatchObject({ success: true })
    expect(executeStep).toHaveBeenCalledTimes(3)
  })
})

describe("WorkflowExecutor selectors and targeting", () => {
  it("clicks CSS, text, exact text, substring text, scoped text, and indexed targets", async () => {
    const { document } = installDom(`
      <button id="css-first">CSS first</button>
      <button id="css-second">CSS second</button>
      <button id="hidden-submit" data-hidden="true">Submit</button>
      <button id="visible-submit">Submit</button>
      <button id="contains-submit">Submit now</button>
      <section id="scope"><button id="scoped">Scoped target</button></section>
      <section><button id="outside">Scoped target</button></section>
    `)

    const clicked: string[] = []
    for (const button of Array.from(document.querySelectorAll("button"))) {
      button.addEventListener("click", () => clicked.push(button.id))
    }

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "click",
          target: { strategy: "css", value: "button", index: 1 },
          button: "left",
          targeting: { scrollIntoView: false },
        },
        {
          op: "click",
          target: { strategy: "text", value: "Submit", exact: true },
          button: "left",
          targeting: { scrollIntoView: false },
        },
        {
          op: "click",
          target: { strategy: "text", value: "now" },
          button: "left",
          targeting: { scrollIntoView: false },
        },
        {
          op: "click",
          target: {
            strategy: "text",
            value: "Scoped target",
            exact: true,
            within: { strategy: "css", value: "#scope" },
          },
          button: "left",
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(clicked).toEqual([
      "css-second",
      "visible-submit",
      "contains-submit",
      "scoped",
    ])
  })

  it("fails clearly for hidden and invalid CSS click targets", async () => {
    installDom(`
      <button id="hidden" data-hidden="true">Hidden</button>
    `)

    await expect(
      runWorkflow({
        version: "1.0",
        steps: [
          {
            op: "click",
            target: { strategy: "css", value: "#hidden" },
            targeting: { ensureVisible: true, scrollIntoView: false },
          },
        ],
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("Element is not visible"),
    })

    await expect(
      runWorkflow({
        version: "1.0",
        steps: [
          {
            op: "click",
            target: { strategy: "css", value: "button[" },
          },
        ],
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("Invalid CSS selector"),
    })
  })
})

describe("WorkflowExecutor wait behavior", () => {
  it("waits for supported selector, URL, readyState, and time conditions", async () => {
    installDom(
      `
        <button id="visible">Ready</button>
        <button id="hidden" data-hidden="true">Hidden</button>
      `,
      {
        url: "https://example.com/workflow-target?ready=true",
        readyState: "complete",
      },
    )

    vi.useFakeTimers()

    const promise = runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "wait",
          for: { selector: { strategy: "css", value: "#visible" } },
        },
        {
          op: "wait",
          for: {
            selector: { strategy: "css", value: "#hidden" },
            state: "hidden",
          },
        },
        {
          op: "wait",
          for: {
            selector: { strategy: "css", value: "#missing" },
            state: "detached",
          },
        },
        { op: "wait", for: { urlIncludes: "ready=true" } },
        { op: "wait", for: { readyState: "interactive" } },
        { op: "wait", for: { timeMs: 25 } },
      ],
    })

    await vi.advanceTimersByTimeAsync(24)
    let didSettle = false
    promise.then(() => {
      didSettle = true
    })
    await Promise.resolve()
    expect(didSettle).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toMatchObject({ success: true })
  })

  it("fails wait steps when a condition is not satisfied before timeout", async () => {
    installDom(`<button id="other">Other</button>`)
    vi.useFakeTimers()

    const promise = runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "wait",
          timeoutMs: 10,
          for: { selector: { strategy: "css", value: "#missing" } },
        },
      ],
    })

    await vi.advanceTimersByTimeAsync(10)
    await expect(promise).resolves.toMatchObject({ success: false })
  })
})

describe("WorkflowExecutor click semantics", () => {
  it("dispatches middle, right, modifier, and double-click details when click options are set", async () => {
    const { document } = installDom(`<button id="target">Target</button>`)
    const target = document.querySelector("#target")!
    const events: Array<{
      type: string
      button: number
      detail: number
      metaKey: boolean
      shiftKey: boolean
    }> = []

    for (const type of ["click", "contextmenu", "dblclick"]) {
      target.addEventListener(type, (event) => {
        const mouseEvent = event as MouseEvent
        events.push({
          type,
          button: mouseEvent.button,
          detail: mouseEvent.detail,
          metaKey: mouseEvent.metaKey,
          shiftKey: mouseEvent.shiftKey,
        })
      })
    }

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "click",
          target: { strategy: "css", value: "#target" },
          button: "middle",
          targeting: { scrollIntoView: false },
        },
        {
          op: "click",
          target: { strategy: "css", value: "#target" },
          button: "right",
          modifiers: ["Meta", "Shift"],
          targeting: { scrollIntoView: false },
        },
        {
          op: "click",
          target: { strategy: "css", value: "#target" },
          button: "left",
          clickCount: 2,
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(events).toEqual([
      {
        type: "click",
        button: 1,
        detail: 1,
        metaKey: false,
        shiftKey: false,
      },
      {
        type: "click",
        button: 2,
        detail: 1,
        metaKey: true,
        shiftKey: true,
      },
      {
        type: "contextmenu",
        button: 2,
        detail: 1,
        metaKey: true,
        shiftKey: true,
      },
      {
        type: "click",
        button: 0,
        detail: 1,
        metaKey: false,
        shiftKey: false,
      },
      {
        type: "click",
        button: 0,
        detail: 2,
        metaKey: false,
        shiftKey: false,
      },
      {
        type: "dblclick",
        button: 0,
        detail: 2,
        metaKey: false,
        shiftKey: false,
      },
    ])
  })

  it("honors click delay between mouse down and mouse up", async () => {
    const { document } = installDom(`<button id="target">Target</button>`)
    const target = document.querySelector("#target")!
    const events: string[] = []

    target.addEventListener("mousedown", () => events.push("down"))
    target.addEventListener("mouseup", () => events.push("up"))

    vi.useFakeTimers()

    const promise = runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "click",
          target: { strategy: "css", value: "#target" },
          button: "left",
          delayMs: 25,
          targeting: { scrollIntoView: false },
        },
      ],
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual(["down"])

    await vi.advanceTimersByTimeAsync(25)
    await expect(promise).resolves.toMatchObject({ success: true })
    expect(events).toEqual(["down", "up"])
  })
})

describe("WorkflowExecutor unsupported operations", () => {
  it("fails unsupported modeled operations explicitly", async () => {
    installDom(`<button id="target">Target</button>`)

    await expect(
      runWorkflow({
        version: "1.0",
        steps: [
          {
            op: "navigate",
            url: "https://example.com/elsewhere",
          },
        ],
      } as unknown as Workflow),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("Unsupported step operation: navigate"),
    })
  })
})
