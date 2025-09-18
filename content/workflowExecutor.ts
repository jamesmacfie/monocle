// Content script workflow executor for DOM interactions
import type {
  ClickStep,
  Selector,
  Step,
  StepResult,
  Workflow,
  WorkflowResult,
} from "../shared/types/workflow"

export class WorkflowExecutor {
  private vars: Record<string, any> = {}

  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    console.log("[WorkflowExecutor] Starting workflow:", workflow.name)
    console.log(
      "[WorkflowExecutor] Full workflow spec:",
      JSON.stringify(workflow, null, 2),
    )

    // Initialize variables
    this.vars = { ...workflow.vars }

    const stepResults: StepResult[] = []

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i]
        console.log(
          `[WorkflowExecutor] Executing step ${i + 1}/${workflow.steps.length}:`,
          step,
        )

        const startTime = Date.now()
        const result = await this.executeStep(step)
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
            step: step,
          })
          return {
            success: false,
            error: `Step ${step.op} failed: ${result.error}`,
            stepResults,
          }
        } else {
          console.log(
            `[WorkflowExecutor] Step ${i + 1} completed successfully in ${duration}ms`,
          )
        }
      }

      console.log("[WorkflowExecutor] Workflow completed successfully")
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

  private async executeStep(step: Step): Promise<StepResult> {
    console.log("[WorkflowExecutor] Executing step:", {
      op: step.op,
      id: step.id,
      description: step.description,
      fullStep: step,
    })

    try {
      switch (step.op) {
        case "click":
          return await this.executeClick(step as ClickStep)
        case "wait":
          // TODO: Implement wait step
          return { success: true }
        default:
          return {
            success: false,
            error: `Unsupported step operation: ${step.op}`,
          }
      }
    } catch (error) {
      console.error("[WorkflowExecutor] Step execution error:", {
        step,
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
    console.log(
      "[WorkflowExecutor] executeClick - Finding element:",
      step.target,
    )

    try {
      const element = await this.findElement(step.target)
      if (!element) {
        console.error("[WorkflowExecutor] Element not found:", {
          selector: step.target,
          searchStrategy: step.target.strategy,
          value: step.target.value,
          documentBody: document.body ? "exists" : "missing",
          visibleElements: document.querySelectorAll("*").length,
        })
        return {
          success: false,
          error: `Could not find element for selector: ${JSON.stringify(step.target)}`,
        }
      }

      console.log("[WorkflowExecutor] Element found:", {
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        textContent: element.textContent?.substring(0, 50),
      })

      // Apply targeting options
      await this.applyTargeting(element, step.targeting)

      // Perform the click
      console.log("[WorkflowExecutor] Clicking element")
      await this.clickElement(element, step)

      console.log("[WorkflowExecutor] Click successful")
      return { success: true }
    } catch (error) {
      console.error("[WorkflowExecutor] Click failed:", {
        error,
        message: error instanceof Error ? error.message : "Click failed",
        stack: error instanceof Error ? error.stack : undefined,
        step,
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Click failed",
      }
    }
  }

  private async findElement(selector: Selector): Promise<Element | null> {
    console.log("[WorkflowExecutor] findElement - Strategy:", selector.strategy)

    switch (selector.strategy) {
      case "css":
        return this.findElementByCSS(selector)
      case "text":
        return this.findElementByText(selector)
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
    console.log(
      "[WorkflowExecutor] findElementByCSS - Selector:",
      selector.value,
    )

    try {
      const elements = document.querySelectorAll(selector.value)
      const index = selector.index ?? 0

      console.log("[WorkflowExecutor] CSS search results:", {
        selector: selector.value,
        found: elements.length,
        requestedIndex: index,
        elementExists: !!elements[index],
      })

      return elements[index] || null
    } catch (error) {
      console.error("[WorkflowExecutor] CSS selector error:", {
        selector: selector.value,
        error: error instanceof Error ? error.message : "Invalid CSS selector",
      })
      return null
    }
  }

  private async findElementByText(selector: {
    strategy: "text"
    value: string
    exact?: boolean
    within?: Selector
    index?: number
  }): Promise<Element | null> {
    console.log("[WorkflowExecutor] findElementByText:", {
      searchText: selector.value,
      exact: selector.exact,
      hasWithin: !!selector.within,
      index: selector.index ?? 0,
    })

    // Get the search scope
    let searchRoot: Element | Document = document
    if (selector.within) {
      const withinElement = await this.findElement(selector.within)
      if (!withinElement) {
        console.log("[WorkflowExecutor] 'within' element not found")
        return null
      }
      searchRoot = withinElement
    }

    // Create a TreeWalker to traverse text nodes
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null,
    )

    const elements: Element[] = []
    let node: Node | null

    // biome-ignore lint/suspicious/noAssignInExpressions: todo: fix this
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() || ""
      const matches = selector.exact
        ? text === selector.value
        : text.includes(selector.value)

      if (matches && node.parentElement) {
        // Check if element is visible
        if (this.isElementVisible(node.parentElement)) {
          elements.push(node.parentElement)
        }
      }
    }

    console.log("[WorkflowExecutor] Text search results:", {
      searchText: selector.value,
      foundCount: elements.length,
      matchingElements: elements.map((el) => ({
        tag: el.tagName,
        text: el.textContent?.substring(0, 50),
      })),
    })

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

    if (scrollIntoView) {
      element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      })
      // Wait a moment for scroll to complete
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private async clickElement(element: Element, step: ClickStep): Promise<void> {
    const htmlElement = element as HTMLElement

    // Try simple click first
    if (typeof htmlElement.click === "function") {
      htmlElement.click()
      return
    }

    // Fallback to event dispatching
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    const button =
      step.button === "right" ? 2 : step.button === "middle" ? 1 : 0
    const clickCount = step.clickCount ?? 1

    // Dispatch pointer events sequence
    const pointerEvents = [
      "pointerover",
      "mouseover",
      "mousemove",
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ]

    for (const eventType of pointerEvents) {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button,
        detail: eventType === "click" ? clickCount : 1,
        ...(step.modifiers && {
          altKey: step.modifiers.includes("Alt"),
          ctrlKey: step.modifiers.includes("Control"),
          metaKey: step.modifiers.includes("Meta"),
          shiftKey: step.modifiers.includes("Shift"),
        }),
      })

      element.dispatchEvent(event)

      // Add delay between down/up if specified
      if (eventType === "mousedown" && step.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, step.delayMs))
      }
    }
  }
}

// Global instance for content script
export const workflowExecutor = new WorkflowExecutor()
