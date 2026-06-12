// Architecture: content layer. The `wait` workflow operation — polling for
// time, selector state, URL, and document readyState conditions. Part of the
// workflow executor op modules (see content/workflow/executor.ts for the
// dispatch table); user-script wait steps and engine condition probes lower
// onto this same implementation.
import type {
  Selector,
  StepResult,
  WaitStep,
} from "../../shared/types/workflow"
import { findElement, isElementVisible, sleep } from "./dom"

const DEFAULT_WAIT_TIMEOUT_MS = 5000
const WAIT_POLL_INTERVAL_MS = 50

const READY_STATE_ORDER: Record<DocumentReadyState, number> = {
  loading: 0,
  interactive: 1,
  complete: 2,
}

/**
 * Executes a wait step. Time waits sleep; condition waits poll every 50ms
 * until satisfied or the step timeout (default 5s) elapses, then fail with a
 * description of the unmet condition.
 */
export const executeWait = async (step: WaitStep): Promise<StepResult> => {
  if ("timeMs" in step.for) {
    if (step.timeoutMs !== undefined && step.timeoutMs < step.for.timeMs) {
      await sleep(step.timeoutMs)
      return {
        success: false,
        error: `Timed out waiting for ${describeWaitCondition(step)}`,
      }
    }

    await sleep(step.for.timeMs)
    return { success: true }
  }

  const timeoutMs = step.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
  const startTime = Date.now()

  while (Date.now() - startTime <= timeoutMs) {
    if (await isWaitConditionSatisfied(step)) {
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
    error: `Timed out waiting for ${describeWaitCondition(step)}`,
  }
}

const isWaitConditionSatisfied = async (step: WaitStep): Promise<boolean> => {
  const condition = step.for

  if ("timeMs" in condition) {
    return true
  }

  if ("selector" in condition) {
    return await matchesSelectorState(
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

export const matchesSelectorState = async (
  selector: Selector,
  state: "attached" | "visible" | "hidden" | "detached",
): Promise<boolean> => {
  const element = await findElement(selector, {
    includeHiddenText: state !== "visible",
  })

  switch (state) {
    case "attached":
      return !!element
    case "visible":
      return !!element && isElementVisible(element)
    case "hidden":
      return !!element && !isElementVisible(element)
    case "detached":
      return !element
  }
}

const describeWaitCondition = (step: WaitStep): string => {
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
