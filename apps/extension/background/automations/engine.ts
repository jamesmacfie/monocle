// Architecture: background layer. The automation engine: resolves an automation
// by id at run time (generated command nodes carry only the id — captured
// documents go stale against storage), builds the interpolation value bag,
// and executes the step list. Content-runnable steps are batched into
// contiguous segments, lowered to workflows (lowering.ts), and run on the
// run's pinned tab via the existing workflow path
// (background/workflows/execution.ts); privileged operations (navigate,
// openUrl, runCommand, clipboardWrite, snippet insertion, toasts) execute
// here between segments — navigation destroys the content context, and only
// the background survives it. Control flow (branch/forEach/while) is
// evaluated engine-side with DOM questions answered by content probes
// (conditions.ts). Runtime abuse limits (one concurrent run per automation per
// tab, non-manual cooldowns, loop and step caps) are re-enforced here as
// defense in depth regardless of what storage contains. The command bridge
// is injected by background/index.ts at startup to keep the automations <->
// commands module graph acyclic.
import type {
  Automation,
  AutomationRunResult,
  AutomationStep,
  AutomationTriggerType,
  Browser,
} from "../../shared/types"
import {
  AUTOMATION_LOOP_DEFAULT_ITERATIONS,
  AUTOMATION_LOOP_MAX_ITERATIONS,
  collectStructuralIssues,
} from "../../shared/types/automationValidation"
import type {
  Selector,
  Step,
  WorkflowResult,
} from "../../shared/types/workflow"
import { walkAutomationSteps } from "../../shared/utils/automation-introspection"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { removeSurface, upsertSurface } from "../surfaces"
import { sendTabMessage } from "../utils/browser"
import {
  ensureHostPermission,
  hostPermissionPatternForUrl,
  openHostPermissionGrantPage,
} from "../utils/hostPermissions"
import {
  executeWorkflowOnTargetTab,
  resolveWorkflowTargetTabId,
} from "../workflows/execution"
import { evaluateCondition } from "./conditions"
import {
  executeAutomationHttpRequest,
  preflightHttpRequests,
} from "./httpRequest"
import {
  type AutomationPageContext,
  type AutomationValueBag,
  buildInitialValueBag,
  interpolateField,
  resolveSnippetValue,
} from "./interpolate"
import {
  endsSegment,
  isEngineStep,
  lowerContentStep,
  retargetForLoopIteration,
  stepExpectsNavigation,
} from "./lowering"
import { getAutomationById } from "./registry"
import { checkRunCommandPolicy } from "./runCommandPolicy"
import {
  NAVIGATION_COMPLETE_TIMEOUT_MS,
  readTabPageContext,
  waitForNavigationAfterAction,
  waitForTabComplete,
} from "./tabNavigation"

// ---------------------------------------------------------------------------
// Command bridge (dependency-injected — see file header)

export type AutomationCommandBridge = {
  resolveCommandMeta: (
    commandId: string,
    context: Browser.Context,
  ) => Promise<{ exists: boolean; confirmAction: boolean }>
  executeCommand: (commandId: string, context: Browser.Context) => Promise<void>
}

let commandBridge: AutomationCommandBridge | null = null

/** Wired once at startup by background/index.ts. */
export const registerAutomationCommandBridge = (
  bridge: AutomationCommandBridge,
): void => {
  commandBridge = bridge
}

// ---------------------------------------------------------------------------
// Runtime abuse limits (module state lives in the service worker; limits are
// per-worker-lifetime, which is the right scope for re-entrancy guards)

const runningRuns = new Set<string>()
const lastNonManualRunByTarget = new Map<string, number>()
const NON_MANUAL_COOLDOWN_MS = 5000
// Generous runaway guard on total executed steps per run: legitimate loops
// can exceed the 100-document-step cap, but nothing legitimate needs this.
const RUNTIME_EXECUTED_STEP_CAP = 5000

export type AutomationInvocation =
  | { kind: "manual"; paramValues?: Record<string, string> }
  | {
      kind: "trigger"
      tabId: number
      trigger: {
        type: Exclude<AutomationTriggerType, "manual">
        url?: string
        matchedText?: string
      }
    }
  | {
      kind: "surfaceAction"
      tabId: number
      surfaceId: string
      actionId: string
      url: string
    }

export type RunAutomationInput = {
  context: Browser.Context
  invocation: AutomationInvocation
}

export type RunAutomationSurfaceActionInput = {
  surfaceId: string
  actionId: string
  tabId: number
  context: Browser.Context
}

export const runAutomationSurfaceAction = async (
  automationId: string,
  input: RunAutomationSurfaceActionInput,
): Promise<AutomationRunResult> =>
  await runAutomation(automationId, {
    context: input.context,
    invocation: {
      kind: "surfaceAction",
      tabId: input.tabId,
      surfaceId: input.surfaceId,
      actionId: input.actionId,
      url: input.context.url,
    },
  })

/**
 * Sentinel for run-fatal failures already attributed to a step or to the run.
 * runEngineStep rethrows it without recording; use another Error when the
 * current engine step should own the failure.
 */
class AutomationRunError extends Error {}

class HostAccessError extends Error {}

type RunState = {
  automation: Automation
  tabId: number
  context: Browser.Context
  pageContext: AutomationPageContext
  values: AutomationValueBag
  isManualRun: boolean
  hostPermissionRequestsAllowed: boolean
  outcomes: NonNullable<AutomationRunResult["stepOutcomes"]>
  executedSteps: number
}

/**
 * Runs an automation end to end and returns the aggregated result. Never
 * throws — failures are reported in the result (and toasted when the
 * automation's showResultToast option is on).
 */
export const runAutomation = async (
  automationId: string,
  input: RunAutomationInput,
): Promise<AutomationRunResult> => {
  const fail = (error: string): AutomationRunResult => ({
    success: false,
    error,
    completedSteps: 0,
  })

  const automation = await getAutomationById(automationId)
  if (!automation) {
    return fail(`Automation not found: ${automationId}`)
  }
  if (!automation.enabled) {
    return fail(`Automation "${automation.name}" is disabled`)
  }

  // Run-time structural re-check: schema caps can be bypassed by direct
  // storage tampering; the engine refuses such documents.
  const structuralIssues = collectStructuralIssues(automation.steps)
  if (structuralIssues.length > 0) {
    return fail(
      `Automation "${automation.name}" failed structural checks: ${structuralIssues[0].message}`,
    )
  }

  const _isManualRun = input.invocation.kind !== "trigger"

  let stepsToRun = automation.steps
  if (input.invocation.kind === "surfaceAction") {
    const invocation = input.invocation
    let selected: AutomationStep[] | undefined
    walkAutomationSteps(automation.steps, (step) => {
      if (
        !selected &&
        step.op === "showSurface" &&
        step.kind === "inline" &&
        step.surfaceId === invocation.surfaceId
      ) {
        selected = step.actions.find(
          (action) => action.id === invocation.actionId,
        )?.steps
      }
    })
    if (!selected) {
      return fail("The inline Automation action no longer exists")
    }
    stepsToRun = selected
  }

  let tabId: number
  try {
    tabId =
      input.invocation.kind !== "manual"
        ? input.invocation.tabId
        : await resolveWorkflowTargetTabId({ context: input.context })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No target tab")
  }

  const runKey = `${automationId}:${tabId}`
  if (runningRuns.has(runKey)) {
    // Re-entrant triggers are dropped, not queued.
    return fail(
      `Automation "${automation.name}" is already running on this tab`,
    )
  }

  if (input.invocation.kind === "trigger") {
    const lastRun = lastNonManualRunByTarget.get(runKey) ?? 0
    if (Date.now() - lastRun < NON_MANUAL_COOLDOWN_MS) {
      return fail(`Automation "${automation.name}" is cooling down`)
    }
    lastNonManualRunByTarget.set(runKey, Date.now())
  }

  runningRuns.add(runKey)
  try {
    // Close the command palette before the automation touches the page — its
    // overlay would otherwise sit on top of whatever the run does. Tabs without
    // a content overlay (chrome://, new-tab) reject this; ignore those.
    try {
      await sendTabMessage(tabId, { type: "monocle-ui-hide" })
    } catch {
      // ponytail: no overlay listening on this tab, nothing to close.
    }
    return await executeRun(automation, stepsToRun, tabId, input)
  } finally {
    runningRuns.delete(runKey)
  }
}

const executeRun = async (
  automation: Automation,
  steps: AutomationStep[],
  tabId: number,
  input: RunAutomationInput,
): Promise<AutomationRunResult> => {
  const trigger =
    input.invocation.kind === "trigger"
      ? input.invocation.trigger
      : input.invocation.kind === "surfaceAction"
        ? { type: "surfaceAction" as const, url: input.invocation.url }
        : { type: "manual" as const, url: input.context.url }

  const pageContext: AutomationPageContext = {
    url: trigger.url ?? input.context.url,
    title: input.context.title,
  }

  const state: RunState = {
    automation,
    tabId,
    context: input.context,
    pageContext,
    values: {},
    isManualRun: input.invocation.kind !== "trigger",
    hostPermissionRequestsAllowed: input.invocation.kind === "manual",
    outcomes: [],
    executedSteps: 0,
  }

  let result: AutomationRunResult
  try {
    await preflightHttpRequests(steps, tabId)
    state.values = await buildInitialValueBag(automation, {
      pageContext,
      trigger,
      paramValues:
        input.invocation.kind === "manual"
          ? input.invocation.paramValues
          : undefined,
      steps,
    })

    if (input.invocation.kind === "surfaceAction") {
      state.values["trigger.surfaceId"] = input.invocation.surfaceId
      state.values["trigger.actionId"] = input.invocation.actionId
    }

    await runStepList(steps, state)

    result = {
      success: true,
      completedSteps: state.executedSteps,
      stepOutcomes: state.outcomes,
    }
  } catch (error) {
    result = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      completedSteps: state.executedSteps,
      stepOutcomes: state.outcomes,
    }
  }

  if (automation.options?.showResultToast !== false) {
    await sendToast(
      state,
      result.success ? "success" : "error",
      result.success
        ? `${automation.name} finished (${result.completedSteps} steps)`
        : `${automation.name} failed: ${result.error}`,
    ).catch(() => undefined)
  }

  if (!result.success) {
    // Log the run shape only — never step payloads (they may carry
    // interpolated credentials).
    console.error("[Automations] Run failed:", {
      automationId: automation.id,
      name: automation.name,
      completedSteps: result.completedSteps,
      error: result.error,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Step list execution: contiguous content steps buffer into one segment,
// flushed before any engine op (and after getText, which writes vars).

const runStepList = async (
  steps: AutomationStep[],
  state: RunState,
): Promise<void> => {
  let buffer: AutomationStep[] = []

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) {
      return
    }
    const segment = buffer
    buffer = []
    const expectNavigation = stepExpectsNavigation(segment[segment.length - 1])
    await runContentSegment(segment, state, expectNavigation)
  }

  for (const step of steps) {
    if (isEngineStep(step)) {
      await flush()
      await runEngineStep(step, state)
      continue
    }

    buffer.push(step)
    if (endsSegment(step)) {
      await flush()
    }
  }

  await flush()
}

const countExecutedStep = (state: RunState): void => {
  state.executedSteps += 1
  if (state.executedSteps > RUNTIME_EXECUTED_STEP_CAP) {
    throw new AutomationRunError(
      `Run exceeded the ${RUNTIME_EXECUTED_STEP_CAP}-step runtime cap`,
    )
  }
}

const hostAccessError = (
  result: { originPattern?: string; error?: string },
  fallbackUrl?: string,
): string => {
  if (result.error) {
    return result.error
  }
  if (result.originPattern) {
    return `Grant site access for ${result.originPattern} to run this automation`
  }
  return `Grant site access for ${fallbackUrl ?? "this page"} to run this automation`
}

const ensureAutomationHostAccess = async (
  state: RunState,
  options: {
    url?: string
    allowRequest?: boolean
    ensureContentScript?: boolean
  } = {},
): Promise<void> => {
  const allowRequest =
    options.allowRequest ?? state.hostPermissionRequestsAllowed
  const result = await ensureHostPermission({
    tabId: state.tabId,
    url: options.url ?? state.pageContext.url,
    reason: "automation",
    request: false,
    ensureContentScript: options.ensureContentScript ?? true,
  })

  if (!result.granted) {
    if (state.isManualRun && allowRequest && !result.error) {
      await openHostPermissionGrantPage({
        tabId: state.tabId,
        url: options.url ?? state.pageContext.url,
        reason: "automation",
      })
      throw new HostAccessError(
        `Grant site access for ${result.originPattern ?? options.url ?? state.pageContext.url} in the opened Monocle tab, then run this automation again`,
      )
    }

    throw new HostAccessError(
      hostAccessError(result, options.url ?? state.pageContext.url),
    )
  }
}

const ensureKnownNavigationHostAccess = async (
  state: RunState,
  url: string,
): Promise<void> => {
  const pattern = hostPermissionPatternForUrl(url)
  if (!pattern.ok) {
    return
  }

  await ensureAutomationHostAccess(state, {
    url,
    allowRequest: state.hostPermissionRequestsAllowed,
    ensureContentScript: false,
  })
}

const runContentSegment = async (
  segment: AutomationStep[],
  state: RunState,
  expectNavigation = false,
): Promise<void> => {
  const lowered: Step[] = segment.map((step) =>
    lowerContentStep(
      step,
      state.automation.id,
      state.values,
      state.pageContext,
    ),
  )

  if (expectNavigation) {
    await runNavigatingContentSegment(segment, lowered, state)
    return
  }

  const result = await runWorkflowSteps(lowered, state, state.automation.name)
  recordSegmentResult(segment, result, state)

  if (!result.success) {
    throw new AutomationRunError(result.error ?? "Step failed")
  }
}

/**
 * Runs a content segment whose final click/submit is expected to navigate the
 * same tab. Navigation tears down the content script, so the response for the
 * navigating action may be lost. That lost response is accepted only if we
 * observe the tab navigation; otherwise the normal workflow result decides.
 */
const runNavigatingContentSegment = async (
  segment: AutomationStep[],
  lowered: Step[],
  state: RunState,
): Promise<void> => {
  const trailing = segment[segment.length - 1]
  const trailingTimeoutMs =
    trailing && "timeoutMs" in trailing ? trailing.timeoutMs : undefined
  const navPromise = waitForNavigationAfterAction(
    state.tabId,
    trailingTimeoutMs ?? NAVIGATION_COMPLETE_TIMEOUT_MS,
  )
  const workflowPromise = runWorkflowSteps(
    lowered,
    state,
    state.automation.name,
  )
    .then((result) => ({ kind: "result", result }) as const)
    .catch((error) => ({ kind: "error", error }) as const)

  const first = await Promise.race([workflowPromise, navPromise])

  if (first.kind === "navigated") {
    recordSegmentSuccess(segment, state)
    await markNavigated(state)
    return
  }

  if (first.kind === "timeout") {
    throw new AutomationRunError("Timed out waiting for navigation to complete")
  }

  if (first.kind === "noNavigation") {
    const outcome = await workflowPromise
    if (outcome.kind === "error") {
      throw outcome.error
    }
    recordSegmentResult(segment, outcome.result, state)
    if (!outcome.result.success) {
      throw new AutomationRunError(outcome.result.error ?? "Step failed")
    }
    return
  }

  const navResult = await navPromise
  if (navResult.kind === "navigated") {
    if (first.kind === "error") {
      recordSegmentSuccess(segment, state)
    } else {
      recordSegmentResult(segment, first.result, state)
      if (!first.result.success) {
        throw new AutomationRunError(first.result.error ?? "Step failed")
      }
    }
    await markNavigated(state)
    return
  }

  if (navResult.kind === "timeout") {
    throw new AutomationRunError("Timed out waiting for navigation to complete")
  }

  if (first.kind === "error") {
    throw first.error
  }

  recordSegmentResult(segment, first.result, state)
  if (!first.result.success) {
    throw new AutomationRunError(first.result.error ?? "Step failed")
  }
}

const recordSegmentSuccess = (
  segment: AutomationStep[],
  state: RunState,
): void => {
  for (const step of segment) {
    countExecutedStep(state)
    state.outcomes.push({ op: step.op, id: step.id, success: true })
  }
}

/** Threads getText vars into the value bag and records per-step outcomes. */
const recordSegmentResult = (
  segment: AutomationStep[],
  result: WorkflowResult,
  state: RunState,
): void => {
  // Thread getText extractions (and only those — segments seed no vars)
  // into the value bag for later interpolation and conditions.
  for (const [name, value] of Object.entries(result.vars ?? {})) {
    state.values[name] = value
  }

  result.stepResults?.forEach((stepResult, index) => {
    countExecutedStep(state)
    state.outcomes.push({
      op: segment[index]?.op ?? "unknown",
      id: segment[index]?.id,
      success: stepResult.success,
      error: stepResult.error,
    })
  })
}

const runWorkflowSteps = async (
  steps: Step[],
  state: RunState,
  name?: string,
): Promise<WorkflowResult> => {
  await ensureAutomationHostAccess(state)

  const { result } = await executeWorkflowOnTargetTab({
    workflow: { version: "1.0", name, steps },
    context: state.context,
    tabId: state.tabId,
  })
  return result
}

/** Probe runner shared with condition evaluation — uncounted, unrecorded. */
const runProbe = (state: RunState) => (steps: Step[]) =>
  runWorkflowSteps(steps, state, `${state.automation.name} (probe)`)

// ---------------------------------------------------------------------------
// Engine ops

const recordEngineOutcome = (
  state: RunState,
  step: AutomationStep,
  error?: string,
): void => {
  countExecutedStep(state)
  state.outcomes.push({
    op: step.op,
    id: step.id,
    success: error === undefined,
    error,
  })
  if (error !== undefined) {
    throw new AutomationRunError(error)
  }
}

const runEngineStep = async (
  step: AutomationStep,
  state: RunState,
): Promise<void> => {
  if (!isEngineStep(step)) {
    throw new AutomationRunError(`Not an engine step: ${step.op}`)
  }

  const interpolate = (text: string): string =>
    interpolateField(text, state.values, state.pageContext)

  try {
    switch (step.op) {
      case "setVariable":
        state.values[step.name] = interpolate(step.value)
        break

      case "toast":
        await sendToast(state, step.level ?? "info", interpolate(step.message))
        break

      case "navigate": {
        const url = interpolate(step.url)
        await navigateCurrentTab(state, url)
        break
      }

      case "openUrl": {
        const url = interpolate(step.url)
        const disposition = step.disposition ?? "newTab"
        const browserAPI = getBrowserAPI()
        if (disposition === "currentTab") {
          await navigateCurrentTab(state, url)
        } else if (disposition === "newWindow") {
          await browserAPI.windows.create({ url })
        } else {
          await browserAPI.tabs.create({ url })
        }
        break
      }

      case "clipboardWrite":
        await ensureAutomationHostAccess(state)
        await sendTabMessage(state.tabId, {
          type: "monocle-clipboard-write",
          message: interpolate(step.text),
        })
        break

      case "insertSnippet":
        await ensureAutomationHostAccess(state)
        await runInsertSnippet(step.snippetId, step.target, state)
        break

      case "runCommand":
        await runCommandStep(step.commandId, state)
        break

      case "httpRequest": {
        const result = await executeAutomationHttpRequest(step, {
          tabId: state.tabId,
          interpolate,
        })
        Object.assign(state.values, result.values)
        break
      }

      case "showSurface":
        await upsertSurface(`automation:${state.automation.id}`, {
          id: step.surfaceId,
          kind: step.kind,
          ...(step.urlMatch ? { urlMatch: step.urlMatch } : {}),
          ...(step.kind !== "inline" && step.blocking !== undefined
            ? { blocking: step.blocking }
            : {}),
          ...(step.kind === "inline"
            ? {
                placement: step.placement,
                actions: step.actions.map(
                  ({ steps: _steps, ...action }) => action,
                ),
              }
            : {}),
          content: {
            ...(step.content.icon ? { icon: step.content.icon } : {}),
            ...(step.content.title !== undefined
              ? { title: interpolate(step.content.title) }
              : {}),
            ...(step.content.text !== undefined
              ? { text: interpolate(step.content.text) }
              : {}),
            ...(step.content.countdownTo !== undefined
              ? { countdownTo: step.content.countdownTo }
              : {}),
          },
        })
        break

      case "hideSurface":
        await removeSurface(`automation:${state.automation.id}`, step.surfaceId)
        break

      case "branch": {
        const matched = await evaluateCondition(step.if, {
          values: state.values,
          pageContext: state.pageContext,
          runProbe: runProbe(state),
        })
        recordEngineOutcome(state, step)
        await runStepList(matched ? step.then : (step.else ?? []), state)
        return
      }

      case "forEach":
        recordEngineOutcome(state, step)
        await runForEach(step, state)
        return

      case "while":
        recordEngineOutcome(state, step)
        await runWhile(step, state)
        return
    }

    recordEngineOutcome(state, step)
  } catch (error) {
    if (error instanceof AutomationRunError) {
      throw error
    }
    recordEngineOutcome(
      state,
      step,
      error instanceof Error ? error.message : "Unknown error",
    )
  }
}

const runInsertSnippet = async (
  snippetId: string,
  target: Selector | undefined,
  state: RunState,
): Promise<void> => {
  const text = await resolveSnippetValue(
    snippetId,
    state.pageContext,
    `insertSnippet step (${snippetId})`,
  )

  if (target) {
    const result = await runWorkflowSteps(
      [{ op: "fill", target, text }],
      state,
      `${state.automation.name} (insert snippet)`,
    )
    if (!result.success) {
      throw new Error(result.error ?? "Snippet insertion failed")
    }
    return
  }

  const response = (await sendTabMessage(state.tabId, {
    type: "monocle-text-insert",
    text,
  })) as { inserted?: boolean } | undefined

  if (!response?.inserted) {
    // Nothing focused: fall back to the clipboard, like palette insertion.
    await sendTabMessage(state.tabId, {
      type: "monocle-clipboard-write",
      message: text,
    })
    await sendToast(
      state,
      "info",
      "No input focused — copied snippet to clipboard",
    )
  }
}

const runCommandStep = async (
  commandId: string,
  state: RunState,
): Promise<void> => {
  if (!commandBridge) {
    throw new Error("Automation command bridge not initialized")
  }

  const meta = await commandBridge.resolveCommandMeta(commandId, state.context)
  const verdict = checkRunCommandPolicy({
    commandId,
    executionMode: state.isManualRun ? "manual" : "automation",
    target: meta,
  })

  if (!verdict.allowed) {
    throw new Error(verdict.reason)
  }

  await commandBridge.executeCommand(commandId, state.context)
}

// ---------------------------------------------------------------------------
// Loops

const loopCap = (requested: number | undefined): number =>
  Math.min(
    requested ?? AUTOMATION_LOOP_DEFAULT_ITERATIONS,
    AUTOMATION_LOOP_MAX_ITERATIONS,
  )

const mapStepsDeep = (
  steps: AutomationStep[],
  transform: (step: AutomationStep) => AutomationStep,
): AutomationStep[] =>
  steps.map((step) => {
    const mapped = transform(step)
    if (mapped.op === "branch") {
      return {
        ...mapped,
        then: mapStepsDeep(mapped.then, transform),
        ...(mapped.else ? { else: mapStepsDeep(mapped.else, transform) } : {}),
      }
    }
    if (mapped.op === "forEach" || mapped.op === "while") {
      return { ...mapped, steps: mapStepsDeep(mapped.steps, transform) }
    }
    return mapped
  })

const withLoopScope = async (
  state: RunState,
  bindings: Record<string, string>,
  body: () => Promise<void>,
): Promise<void> => {
  const saved = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(bindings)) {
    saved.set(key, state.values[key])
    state.values[key] = value
  }
  try {
    await body()
  } finally {
    for (const [key, previous] of saved) {
      if (previous === undefined) {
        delete state.values[key]
      } else {
        state.values[key] = previous
      }
    }
  }
}

const runForEach = async (
  step: Extract<AutomationStep, { op: "forEach" }>,
  state: RunState,
): Promise<void> => {
  const itemName = step.as ?? "item"
  const cap = loopCap(step.maxIterations)

  if ("variable" in step.over) {
    const lines = (state.values[step.over.variable] ?? "")
      .split("\n")
      .filter((line) => line.trim() !== "")

    for (let index = 0; index < Math.min(lines.length, cap); index++) {
      await withLoopScope(
        state,
        { [itemName]: lines[index], index: String(index) },
        () => runStepList(step.steps, state),
      )
    }
    return
  }

  const loopSelector = step.over.elements
  const probe = runProbe(state)

  for (let index = 0; index < cap; index++) {
    const pinned: Selector = { ...loopSelector, index }

    const exists = await probe([
      {
        op: "wait",
        timeoutMs: 300,
        for: { selector: pinned, state: "attached" },
      },
    ])
    if (!exists.success) {
      break
    }

    // Bind {{item}} to the current element's text so loop bodies can use it
    // in templates; missing text reads as "".
    const textProbe = await probe([
      { op: "getText", from: pinned, toVar: "__monocleLoopItem" },
    ])
    const itemText = textProbe.vars?.__monocleLoopItem ?? ""

    const retargeted = mapStepsDeep(step.steps, (bodyStep) =>
      retargetForLoopIteration(bodyStep, loopSelector, index),
    )

    await withLoopScope(
      state,
      { [itemName]: itemText, index: String(index) },
      () => runStepList(retargeted, state),
    )
  }
}

const runWhile = async (
  step: Extract<AutomationStep, { op: "while" }>,
  state: RunState,
): Promise<void> => {
  const cap = loopCap(step.maxIterations)

  for (let index = 0; index < cap; index++) {
    const holds = await evaluateCondition(step.condition, {
      values: state.values,
      pageContext: state.pageContext,
      runProbe: runProbe(state),
    })
    if (!holds) {
      return
    }

    await withLoopScope(state, { index: String(index) }, () =>
      runStepList(step.steps, state),
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers

const sendToast = async (
  state: RunState,
  level: "info" | "success" | "error",
  message: string,
): Promise<void> => {
  await sendTabMessage(state.tabId, {
    type: "monocle-toast",
    level,
    message,
  })
}

const refreshPageContext = async (state: RunState): Promise<void> => {
  const pageContext = await readTabPageContext(state.tabId)
  if (!pageContext) {
    return
  }

  const url = pageContext.url ?? state.pageContext.url
  const title = pageContext.title ?? state.pageContext.title
  state.pageContext = { url, title }
  state.context = { ...state.context, url: url ?? "", title: title ?? "" }
}

const markNavigated = async (state: RunState): Promise<void> => {
  await refreshPageContext(state)
  state.hostPermissionRequestsAllowed = false
}

const navigateCurrentTab = async (
  state: RunState,
  url: string,
): Promise<void> => {
  await ensureKnownNavigationHostAccess(state, url)
  await getBrowserAPI().tabs.update(state.tabId, { url })
  await waitForTabComplete(state.tabId)
  await markNavigated(state)
}
