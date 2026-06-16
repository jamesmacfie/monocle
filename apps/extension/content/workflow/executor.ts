// Architecture: content layer. The workflow executor core — receives a
// lowered `Workflow` document from the background (via the
// `execute-workflow-content` tab message handled in
// shared/hooks/useCommandPaletteStateRedux.tsx), runs each step through the
// shared retry/timeout policy, dispatches to the op modules
// (interactionOps/formOps/domOps/waitOps), and reports per-step results plus
// the final variable bag back to the background. The op switch below is the
// content half of the lockstep invariant: every case must have a schema
// entry in shared/types/workflowValidation.ts, and unsupported ops fail
// loudly rather than silently succeeding (docs/workflow-automation.md).
import type {
  Step,
  StepResult,
  Workflow,
  WorkflowResult,
} from "../../shared/types/workflow"
import { sleep } from "./dom"
import {
  executeGetText,
  executeHideElement,
  executeInjectCss,
  executeRemoveElement,
} from "./domOps"
import {
  executeFill,
  executeKeyCombo,
  executeSelect,
  executeSetChecked,
  executeSubmit,
  executeType,
} from "./formOps"
import {
  executeBlur,
  executeClick,
  executeFocus,
  executeHover,
  executeScroll,
} from "./interactionOps"
import { executeWait } from "./waitOps"

export class WorkflowExecutor {
  private vars: Record<string, string> = {}

  /**
   * Runs every step in order, aborting on the first failure (the
   * first-failure-aborts contract automations inherit). Returns per-step
   * results and the final var values so callers can thread getText
   * extractions onward.
   */
  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    this.vars = {}
    for (const [name, value] of Object.entries(workflow.vars ?? {})) {
      this.vars[name] = value === null ? "" : String(value)
    }

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
            vars: { ...this.vars },
          }
        }
      }

      return {
        success: true,
        stepResults,
        vars: { ...this.vars },
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
        vars: { ...this.vars },
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
    // Wait steps own their timeout semantics (timeoutMs bounds the poll).
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
          return await executeClick(step)
        case "wait":
          return await executeWait(step)
        case "hover":
          return await executeHover(step)
        case "focus":
          return await executeFocus(step)
        case "blur":
          return await executeBlur(step)
        case "fill":
          return await executeFill(step)
        case "type":
          return await executeType(step)
        case "key":
          return await executeKeyCombo(step)
        case "select":
          return await executeSelect(step)
        case "check":
        case "uncheck":
          return await executeSetChecked(step)
        case "submit":
          return await executeSubmit(step)
        case "scroll":
          return await executeScroll(step)
        case "getText":
          return await executeGetText(step, (name, value) => {
            this.vars[name] = value
          })
        case "removeElement":
          return await executeRemoveElement(step)
        case "hideElement":
          return await executeHideElement(step)
        case "injectCss":
          return await executeInjectCss(step)
        default:
          return {
            success: false,
            error: `Unsupported step operation: ${(step as Step).op}`,
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
}

// Global instance for the content script.
export const workflowExecutor = new WorkflowExecutor()
