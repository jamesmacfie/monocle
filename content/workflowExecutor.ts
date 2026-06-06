// Content script workflow executor for DOM interactions
import type {
  ClickStep,
  Selector,
  Step,
  StepResult,
  WaitStep,
  Workflow,
  WorkflowResult,
} from "../shared/types/workflow"

const DEFAULT_WAIT_TIMEOUT_MS = 5000
const WAIT_POLL_INTERVAL_MS = 50

const READY_STATE_ORDER: Record<DocumentReadyState, number> = {
  loading: 0,
  interactive: 1,
  complete: 2,
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

type FindElementOptions = {
  includeHiddenText?: boolean
}

export class WorkflowExecutor {
  private vars: Record<string, any> = {}

  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    this.vars = { ...workflow.vars }

    const stepResults: StepResult[] = []

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i]
        const startTime = Date.now()
        const result = await this.executeStepWithPolicy(step)
        const duration = Date.now() - startTime

        stepResults.push({
          stepId: step.id,
          success: result.success,
          error: result.error,
          duration,
        })

        if (!result.success) {
          console.error(`[WorkflowExecutor] Step ${i + 1} failed:`, {
            op: step.op,
            id: step.id,
            error: result.error,
          })
          return {
            success: false,
            error: `Step ${step.op} failed: ${result.error}`,
            stepResults,
          }
        }
      }

      return {
        success: true,
        stepResults,
      }
    } catch (error) {
      console.error("[WorkflowExecutor] Workflow execution failed:", {
        error,
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        workflow: workflow.name,
        completedSteps: stepResults.length,
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stepResults,
      }
    }
  }

  private async executeStepWithPolicy(step: Step): Promise<StepResult> {
    const attempts = (step.retry?.retries ?? 0) + 1
    let lastResult: StepResult | undefined

    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = await this.executeStepWithTimeout(step)

      if (result.success) {
        return result
      }

      lastResult = result

      if (attempt < attempts - 1) {
        await sleep(this.getRetryDelay(step, attempt))
      }
    }

    return lastResult ?? { success: false, error: "Step failed" }
  }

  private async executeStepWithTimeout(step: Step): Promise<StepResult> {
    if (step.timeoutMs === undefined || step.op === "wait") {
      return await this.executeStep(step)
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      return await Promise.race([
        this.executeStep(step),
        new Promise<StepResult>((resolve) => {
          timeoutId = setTimeout(() => {
            resolve({
              success: false,
              error: `Timed out after ${step.timeoutMs}ms`,
            })
          }, step.timeoutMs)
        }),
      ])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  private getRetryDelay(step: Step, completedAttemptIndex: number): number {
    const retry = step.retry
    if (!retry) {
      return 0
    }

    const baseDelay = retry.delayMs ?? 0
    if (retry.backoff !== "exponential") {
      return baseDelay
    }

    return baseDelay * 2 ** completedAttemptIndex
  }

  private async executeStep(step: Step): Promise<StepResult> {
    try {
      switch (step.op) {
        case "click":
          return await this.executeClick(step)
        case "wait":
          return await this.executeWait(step)
        default:
          return {
            success: false,
            error: `Unsupported step operation: ${step.op}`,
          }
      }
    } catch (error) {
      console.error("[WorkflowExecutor] Step execution error:", {
        op: step.op,
        id: step.id,
        error,
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private async executeClick(step: ClickStep): Promise<StepResult> {
    const element = await this.findElement(step.target)
    if (!element) {
      return {
        success: false,
        error: `Could not find element for selector: ${JSON.stringify(step.target)}`,
      }
    }

    await this.applyTargeting(element, step.targeting)
    await this.clickElement(element, step)

    return { success: true }
  }

  private async executeWait(step: WaitStep): Promise<StepResult> {
    if ("timeMs" in step.for) {
      if (step.timeoutMs !== undefined && step.timeoutMs < step.for.timeMs) {
        await sleep(step.timeoutMs)
        return {
          success: false,
          error: `Timed out waiting for ${this.describeWaitCondition(step)}`,
        }
      }

      await sleep(step.for.timeMs)
      return { success: true }
    }

    const timeoutMs = step.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
    const startTime = Date.now()

    while (Date.now() - startTime <= timeoutMs) {
      if (await this.isWaitConditionSatisfied(step)) {
        return { success: true }
      }

      const elapsed = Date.now() - startTime
      const remaining = timeoutMs - elapsed
      if (remaining <= 0) {
        break
      }

      await sleep(Math.min(WAIT_POLL_INTERVAL_MS, remaining))
    }

    return {
      success: false,
      error: `Timed out waiting for ${this.describeWaitCondition(step)}`,
    }
  }

  private async isWaitConditionSatisfied(step: WaitStep): Promise<boolean> {
    const condition = step.for

    if ("timeMs" in condition) {
      return true
    }

    if ("selector" in condition) {
      return await this.matchesSelectorState(
        condition.selector,
        condition.state ?? "visible",
      )
    }

    if ("urlIncludes" in condition) {
      return window.location.href.includes(condition.urlIncludes)
    }

    return (
      READY_STATE_ORDER[document.readyState] >=
      READY_STATE_ORDER[condition.readyState]
    )
  }

  private async matchesSelectorState(
    selector: Selector,
    state: "attached" | "visible" | "hidden" | "detached",
  ): Promise<boolean> {
    const element = await this.findElement(selector, {
      includeHiddenText: state !== "visible",
    })

    switch (state) {
      case "attached":
        return !!element
      case "visible":
        return !!element && this.isElementVisible(element)
      case "hidden":
        return !!element && !this.isElementVisible(element)
      case "detached":
        return !element
    }
  }

  private describeWaitCondition(step: WaitStep): string {
    const condition = step.for

    if ("timeMs" in condition) {
      return `${condition.timeMs}ms delay`
    }

    if ("selector" in condition) {
      return `${condition.state ?? "visible"} selector ${JSON.stringify(condition.selector)}`
    }

    if ("urlIncludes" in condition) {
      return `URL to include "${condition.urlIncludes}"`
    }

    return `document readyState ${condition.readyState}`
  }

  private async findElement(
    selector: Selector,
    options: FindElementOptions = {},
  ): Promise<Element | null> {
    switch (selector.strategy) {
      case "css":
        return this.findElementByCSS(selector)
      case "text":
        return this.findElementByText(selector, options)
      default: {
        const error = `Unsupported selector strategy: ${(selector as any).strategy}`
        console.error(`[WorkflowExecutor] ${error}`, selector)
        throw new Error(error)
      }
    }
  }

  private findElementByCSS(selector: {
    strategy: "css"
    value: string
    index?: number
  }): Element | null {
    try {
      const elements = document.querySelectorAll(selector.value)
      const index = selector.index ?? 0

      return elements[index] || null
    } catch (error) {
      console.error("[WorkflowExecutor] CSS selector error:", {
        selector: selector.value,
        error: error instanceof Error ? error.message : "Invalid CSS selector",
      })
      throw new Error(
        `Invalid CSS selector "${selector.value}": ${
          error instanceof Error ? error.message : "Unknown selector error"
        }`,
      )
    }
  }

  private async findElementByText(
    selector: {
      strategy: "text"
      value: string
      exact?: boolean
      within?: Selector
      index?: number
    },
    options: FindElementOptions,
  ): Promise<Element | null> {
    let searchRoot: Element | Document = document
    if (selector.within) {
      const withinElement = await this.findElement(selector.within, options)
      if (!withinElement) {
        console.log("[WorkflowExecutor] 'within' element not found")
        return null
      }
      searchRoot = withinElement
    }

    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null,
    )

    const elements: Element[] = []
    let node: Node | null = walker.nextNode()

    while (node) {
      const text = node.textContent?.trim() || ""
      const matches = selector.exact
        ? text === selector.value
        : text.includes(selector.value)

      if (matches && node.parentElement) {
        if (
          options.includeHiddenText ||
          this.isElementVisible(node.parentElement)
        ) {
          elements.push(node.parentElement)
        }
      }

      node = walker.nextNode()
    }

    const index = selector.index ?? 0
    return elements[index] || null
  }

  private isElementVisible(element: Element): boolean {
    if (!element.isConnected) return false

    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden") return false

    return true
  }

  private async applyTargeting(
    element: Element,
    targeting?: { scrollIntoView?: boolean; ensureVisible?: boolean },
  ): Promise<void> {
    const scrollIntoView = targeting?.scrollIntoView ?? true
    const ensureVisible = targeting?.ensureVisible ?? true

    if (ensureVisible && !this.isElementVisible(element)) {
      throw new Error("Element is not visible")
    }

    if (scrollIntoView && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      })
      await sleep(100)
    }
  }

  private async clickElement(element: Element, step: ClickStep): Promise<void> {
    const htmlElement = element as HTMLElement

    if (
      !this.requiresSyntheticClick(step) &&
      typeof htmlElement.click === "function"
    ) {
      htmlElement.click()
      return
    }

    await this.dispatchClickSequence(element, step)
  }

  private requiresSyntheticClick(step: ClickStep): boolean {
    return (
      step.button !== undefined ||
      step.clickCount !== undefined ||
      step.delayMs !== undefined ||
      (step.modifiers?.length ?? 0) > 0
    )
  }

  private async dispatchClickSequence(
    element: Element,
    step: ClickStep,
  ): Promise<void> {
    const clickCount = step.clickCount ?? 1

    this.dispatchMouseEvent(element, "pointerover", step, 0)
    this.dispatchMouseEvent(element, "mouseover", step, 0)
    this.dispatchMouseEvent(element, "mousemove", step, 0)

    for (let clickIndex = 0; clickIndex < clickCount; clickIndex++) {
      const detail = clickIndex + 1

      this.dispatchMouseEvent(element, "pointerdown", step, detail)
      this.dispatchMouseEvent(element, "mousedown", step, detail)

      if (step.delayMs) {
        await sleep(step.delayMs)
      }

      this.dispatchMouseEvent(element, "pointerup", step, detail)
      this.dispatchMouseEvent(element, "mouseup", step, detail)
      this.dispatchMouseEvent(element, "click", step, detail)

      if (step.button === "right") {
        this.dispatchMouseEvent(element, "contextmenu", step, detail)
      }
    }

    if ((step.clickCount ?? 1) === 2) {
      this.dispatchMouseEvent(element, "dblclick", step, 2)
    }
  }

  private dispatchMouseEvent(
    element: Element,
    eventType: string,
    step: ClickStep,
    detail: number,
  ): void {
    const rect = element.getBoundingClientRect()
    const button =
      step.button === "right" ? 2 : step.button === "middle" ? 1 : 0

    element.dispatchEvent(
      new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button,
        buttons: eventType.includes("down") ? 1 << button : 0,
        detail,
        altKey: step.modifiers?.includes("Alt") ?? false,
        ctrlKey: step.modifiers?.includes("Control") ?? false,
        metaKey: step.modifiers?.includes("Meta") ?? false,
        shiftKey: step.modifiers?.includes("Shift") ?? false,
      }),
    )
  }
}

// Global instance for content script
export const workflowExecutor = new WorkflowExecutor()
