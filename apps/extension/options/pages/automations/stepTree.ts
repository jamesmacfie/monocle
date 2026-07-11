// Architecture: pure UI-state adapter for the recursive Automations step
// editor. Stored AutomationStep trees are hydrated into stable editor nodes;
// assembly reverses that transformation and is the only place nested UI state
// becomes the persisted wire shape. UI-only keys and invalid JSON drafts never
// cross the storage boundary.
import type {
  AutomationStep,
  AutomationSurfaceAction,
} from "../../../shared/types"
import { createDefaultStepRow, FORM_OPS, jsonStepRow } from "./stepEditors"
import type {
  StepChildGroups,
  StepNodeState,
  StepRowState,
  SurfaceActionEditorState,
} from "./stepEditors/types"

let nextEditorKey = 0

const editorKey = (prefix: string): string => {
  nextEditorKey += 1
  return `${prefix}-${nextEditorKey}`
}

export const stepValueFromRow = (row: StepRowState): AutomationStep | null =>
  row.kind === "form" ? row.step : row.parsed

const rowFromStep = (step: AutomationStep): StepRowState => {
  if (step.op === "scroll" && typeof step.to !== "string") {
    return jsonStepRow(step)
  }
  if (!FORM_OPS.has(step.op)) {
    return jsonStepRow(step)
  }
  return { kind: "form", step }
}

const surfaceActionFromValue = (
  action: AutomationSurfaceAction,
): SurfaceActionEditorState => ({
  editorKey: editorKey("surface-action"),
  id: action.id,
  label: action.label,
  ...(action.icon ? { icon: action.icon } : {}),
  ...(action.style ? { style: action.style } : {}),
  steps: action.steps.map(stepNodeFromStep),
})

const childGroupsFromStep = (
  step: AutomationStep | null,
): StepChildGroups | undefined => {
  if (!step) return undefined
  if (step.op === "branch") {
    return {
      kind: "branch",
      then: step.then.map(stepNodeFromStep),
      ...(step.else ? { else: step.else.map(stepNodeFromStep) } : {}),
    }
  }
  if (step.op === "forEach" || step.op === "while") {
    return { kind: step.op, steps: step.steps.map(stepNodeFromStep) }
  }
  if (step.op === "showSurface" && step.kind === "inline") {
    return {
      kind: "surfaceActions",
      actions: step.actions.map(surfaceActionFromValue),
    }
  }
  return undefined
}

export const stepNodeFromStep = (step: AutomationStep): StepNodeState => ({
  editorKey: editorKey("step"),
  row: rowFromStep(step),
  children: childGroupsFromStep(step),
})

export const createDefaultStepNode = (
  op: AutomationStep["op"],
): StepNodeState => {
  const row = createDefaultStepRow(op)
  return {
    editorKey: editorKey("step"),
    row,
    children: childGroupsFromStep(stepValueFromRow(row)),
  }
}

const matchingChildren = (
  children: StepChildGroups | undefined,
  step: AutomationStep,
): boolean => {
  if (step.op === "branch") return children?.kind === "branch"
  if (step.op === "forEach") return children?.kind === "forEach"
  if (step.op === "while") return children?.kind === "while"
  if (step.op === "showSurface" && step.kind === "inline") {
    return children?.kind === "surfaceActions"
  }
  return children === undefined
}

export const updateStepNodeRow = (
  node: StepNodeState,
  row: StepRowState,
): StepNodeState => {
  const step = stepValueFromRow(row)
  if (!step) return { ...node, row }
  if (matchingChildren(node.children, step)) return { ...node, row }
  return { ...node, row, children: childGroupsFromStep(step) }
}

type StepAssembly = {
  steps: AutomationStep[]
  issues: string[]
  complete: boolean
}

const assembleNodes = (
  nodes: StepNodeState[],
  path: Array<string | number>,
): StepAssembly => {
  const steps: AutomationStep[] = []
  const issues: string[] = []
  let complete = true

  nodes.forEach((node, index) => {
    const stepPath = [...path, index]
    const row = node.row
    if (row.kind === "json" && row.error) {
      issues.push(`${stepPath.join(".")}: ${row.error}`)
    }
    const base = stepValueFromRow(row)
    if (!base) {
      complete = false
      return
    }

    if (base.op === "branch" && node.children?.kind === "branch") {
      const thenResult = assembleNodes(node.children.then, [
        ...stepPath,
        "then",
      ])
      const elseResult = node.children.else
        ? assembleNodes(node.children.else, [...stepPath, "else"])
        : null
      issues.push(...thenResult.issues, ...(elseResult?.issues ?? []))
      complete &&= thenResult.complete && (elseResult?.complete ?? true)
      steps.push({
        ...base,
        then: thenResult.steps,
        ...(node.children.else ? { else: elseResult?.steps ?? [] } : {}),
      })
      return
    }

    if (
      (base.op === "forEach" || base.op === "while") &&
      node.children?.kind === base.op
    ) {
      const bodyResult = assembleNodes(node.children.steps, [
        ...stepPath,
        "steps",
      ])
      issues.push(...bodyResult.issues)
      complete &&= bodyResult.complete
      steps.push({ ...base, steps: bodyResult.steps } as AutomationStep)
      return
    }

    if (
      base.op === "showSurface" &&
      base.kind === "inline" &&
      node.children?.kind === "surfaceActions"
    ) {
      const actions = node.children.actions.map((action, actionIndex) => {
        const actionResult = assembleNodes(action.steps, [
          ...stepPath,
          "actions",
          actionIndex,
          "steps",
        ])
        issues.push(...actionResult.issues)
        complete &&= actionResult.complete
        return {
          id: action.id,
          label: action.label,
          ...(action.icon ? { icon: action.icon } : {}),
          ...(action.style ? { style: action.style } : {}),
          steps: actionResult.steps,
        }
      })
      steps.push({ ...base, actions })
      return
    }

    steps.push(base)
  })

  return { steps, issues, complete }
}

export const assembleStepNodes = (
  nodes: StepNodeState[],
  path: Array<string | number> = ["steps"],
): StepAssembly => assembleNodes(nodes, path)

export const countStepNodes = (nodes: StepNodeState[]): number =>
  nodes.reduce((total, node) => {
    let nested = 0
    if (node.children?.kind === "branch") {
      nested =
        countStepNodes(node.children.then) +
        countStepNodes(node.children.else ?? [])
    } else if (
      node.children?.kind === "forEach" ||
      node.children?.kind === "while"
    ) {
      nested = countStepNodes(node.children.steps)
    } else if (node.children?.kind === "surfaceActions") {
      nested = node.children.actions.reduce(
        (sum, action) => sum + countStepNodes(action.steps),
        0,
      )
    }
    return total + 1 + nested
  }, 0)

export const createSurfaceActionEditorState = (
  existingIds: string[],
): SurfaceActionEditorState => {
  let suffix = existingIds.length + 1
  let id = `action${suffix}`
  while (existingIds.includes(id)) {
    suffix += 1
    id = `action${suffix}`
  }
  return {
    editorKey: editorKey("surface-action"),
    id,
    label: `Button ${suffix}`,
    style: existingIds.length === 0 ? "primary" : "default",
    steps: [createDefaultStepNode("toast")],
  }
}
