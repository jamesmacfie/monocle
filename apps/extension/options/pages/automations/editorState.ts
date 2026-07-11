// Architecture: options/ page-local helpers for the Automations builder.
// Bridges the stored `Automation` document model (shared/types/automations.ts)
// and the editable form state in AutomationEditorPage: rows for steps,
// triggers, and variables, defaults for newly added entries, and assembly of
// the form state back into a draft for `validateAutomationDraft`. Recursive
// step-tree hydration/assembly lives in stepTree.ts; this module composes that
// pure adapter with the rest of the document draft. No React or messaging.
import type {
  Automation,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationVarDef,
  ColorName,
  IconName,
} from "../../../shared/types"
import type { AutomationDraft } from "../../../shared/types/automationValidation"
import {
  interpolatableStrings,
  walkAutomationSteps,
} from "../../../shared/utils/automation-introspection"
import { collectTemplateReferences } from "../../../shared/utils/automation-template"
import { createDefaultSelector, type StepNodeState } from "./stepEditors"
import {
  assembleStepNodes,
  createDefaultStepNode,
  stepNodeFromStep,
} from "./stepTree"

export {
  createDefaultSelector,
  STEP_OP_OPTIONS,
} from "./stepEditors"
export { createDefaultStepNode } from "./stepTree"

// ---------------------------------------------------------------------------
// Row state

export type TriggerRowState = {
  trigger: AutomationTrigger
  // Manual triggers only: the raw parameters JSON being edited (parsed on
  // blur; empty means "no parameters").
  paramsText: string
  paramsError: string | null
}

export type VarRowState = {
  name: string
  def: AutomationVarDef
}

export type EditorDraftState = {
  name: string
  description: string
  icon: IconName | ""
  color: ColorName | ""
  enabled: boolean
  // One URL pattern per row (allow scopes both the palette row and automatic
  // triggers; deny hides). Empty rows are trimmed out at assembly.
  allowRows: string[]
  denyRows: string[]
  triggers: TriggerRowState[]
  vars: VarRowState[]
  steps: StepNodeState[]
  // Preserved verbatim across edits so saving never drops them.
  options?: Automation["options"]
  source?: Automation["source"]
}

// ---------------------------------------------------------------------------
// Curated metadata options (subset of the closed icon/color sets)

export const AUTOMATION_ICON_OPTIONS: IconName[] = [
  "Workflow",
  "Zap",
  "Bot",
  "WandSparkles",
  "Sparkles",
  "Play",
  "Rocket",
  "RefreshCw",
  "Timer",
  "AlarmClock",
  "LogIn",
  "LogOut",
  "Globe",
  "Link",
  "Search",
  "TextCursorInput",
  "ListChecks",
  "FileText",
  "Clipboard",
  "ClipboardCheck",
  "Mail",
  "Bell",
  "Star",
  "Shield",
  "Terminal",
  "Code",
  "Pencil",
  "Trash2",
  "Download",
  "Upload",
  "Send",
  "EyeOff",
]

export const AUTOMATION_COLOR_OPTIONS: ColorName[] = [
  "red",
  "green",
  "blue",
  "amber",
  "lightBlue",
  "gray",
  "purple",
  "orange",
  "teal",
  "pink",
  "indigo",
  "yellow",
]

// ---------------------------------------------------------------------------
// Triggers

export const TRIGGER_TYPE_LABELS: Record<AutomationTriggerType, string> = {
  manual: "Manual (run from the palette)",
  urlMatch: "URL match (page opens in scope)",
  elementAppears: "Element appears",
  interval: "Repeating interval",
  schedule: "Daily schedule",
  onStartup: "Browser startup",
}

export const TRIGGER_TYPES: AutomationTriggerType[] = [
  "manual",
  "urlMatch",
  "elementAppears",
  "interval",
  "schedule",
  "onStartup",
]

export const createDefaultTrigger = (
  type: AutomationTriggerType,
): AutomationTrigger => {
  switch (type) {
    case "manual":
      return { type: "manual" }
    case "urlMatch":
      return { type: "urlMatch", on: ["load"], disarmed: true }
    case "elementAppears":
      return {
        type: "elementAppears",
        selector: createDefaultSelector(),
        disarmed: true,
      }
    case "interval":
      return { type: "interval", everyMinutes: 30, disarmed: true }
    case "schedule":
      return { type: "schedule", at: "09:00", disarmed: true }
    case "onStartup":
      return { type: "onStartup", disarmed: true }
  }
}

export const triggerRowFromTrigger = (
  trigger: AutomationTrigger,
): TriggerRowState => ({
  trigger,
  paramsText:
    trigger.type === "manual" && trigger.parameters
      ? JSON.stringify(trigger.parameters, null, 2)
      : "",
  paramsError: null,
})

// ---------------------------------------------------------------------------
// State construction

export const createEmptyEditorState = (): EditorDraftState => ({
  name: "",
  description: "",
  icon: "Workflow",
  color: "",
  enabled: true,
  allowRows: [],
  denyRows: [],
  triggers: [triggerRowFromTrigger({ type: "manual" })],
  vars: [],
  steps: [createDefaultStepNode("toast")],
})

export const editorStateFromScript = (
  script: Automation,
): EditorDraftState => ({
  name: script.name,
  description: script.description ?? "",
  icon: script.icon ?? "",
  color: script.color ?? "",
  enabled: script.enabled,
  allowRows: [...(script.urlRules?.allowUrls ?? [])],
  denyRows: [...(script.urlRules?.denyUrls ?? [])],
  triggers: script.triggers.map(triggerRowFromTrigger),
  vars: Object.entries(script.vars ?? {}).map(([name, def]) => ({
    name,
    def,
  })),
  steps: script.steps.map(stepNodeFromStep),
  options: script.options,
  source: script.source,
})

// ---------------------------------------------------------------------------
// Assembly back into a draft document

const cleanPatterns = (rows: string[]): string[] =>
  rows.map((row) => row.trim()).filter((row) => row.length > 0)

export type AssembledDraft = {
  // Null when a JSON step row has never parsed (nothing sensible to
  // validate). Otherwise the draft object to feed validateAutomationDraft.
  draft: unknown | null
  // Row-level problems the Zod schema cannot see (bad JSON text, duplicate
  // variable names, bad parameter JSON). Non-empty blocks saving.
  issues: string[]
}

export const assembleDraft = (state: EditorDraftState): AssembledDraft => {
  const issues: string[] = []

  const stepAssembly = assembleStepNodes(state.steps)
  issues.push(...stepAssembly.issues)

  state.triggers.forEach((row, index) => {
    if (row.paramsError) {
      issues.push(`Trigger ${index + 1}: ${row.paramsError}`)
    }
  })

  const seenVarNames = new Set<string>()
  for (const row of state.vars) {
    if (seenVarNames.has(row.name)) {
      issues.push(`Duplicate variable name "${row.name}"`)
    }
    seenVarNames.add(row.name)
  }

  if (!stepAssembly.complete) {
    return { draft: null, issues }
  }

  const allowUrls = cleanPatterns(state.allowRows)
  const denyUrls = cleanPatterns(state.denyRows)

  const draft = {
    schemaVersion: 1 as const,
    name: state.name,
    ...(state.description.trim() ? { description: state.description } : {}),
    ...(state.icon ? { icon: state.icon } : {}),
    ...(state.color ? { color: state.color } : {}),
    enabled: state.enabled,
    ...(allowUrls.length > 0 || denyUrls.length > 0
      ? {
          urlRules: {
            ...(allowUrls.length > 0 ? { allowUrls } : {}),
            ...(denyUrls.length > 0 ? { denyUrls } : {}),
          },
        }
      : {}),
    triggers: state.triggers.map((row) => row.trigger),
    ...(state.vars.length > 0
      ? {
          vars: Object.fromEntries(
            state.vars.map((row) => [row.name, row.def]),
          ),
        }
      : {}),
    steps: stepAssembly.steps,
    ...(state.options ? { options: state.options } : {}),
    ...(state.source ? { source: state.source } : {}),
  }

  return { draft, issues }
}

// ---------------------------------------------------------------------------
// Template-reference warnings (non-blocking)

/**
 * Lists `{{name}}` references that resolve to nothing the run can provide:
 * not a declared variable, not a loop binding, and not in the trigger /
 * params / snippet namespaces. Warning-only — unknown names expand to "".
 */
export const collectTemplateWarnings = (draft: AutomationDraft): string[] => {
  const known = new Set(Object.keys(draft.vars ?? {}))
  known.add("item")
  known.add("index")

  walkAutomationSteps(draft.steps, (step) => {
    if (step.op === "forEach" && step.as) {
      known.add(step.as)
    }
  })

  const unknown = new Set<string>()
  walkAutomationSteps(draft.steps, (step) => {
    for (const text of interpolatableStrings(step)) {
      for (const name of collectTemplateReferences(text)) {
        if (
          !known.has(name) &&
          !name.startsWith("trigger.") &&
          !name.startsWith("params.") &&
          !name.startsWith("snippet:")
        ) {
          unknown.add(name)
        }
      }
    }
  })

  return [...unknown]
}

export const EDITOR_INDEXED_COLLECTIONS = ["steps", "triggers"] as const

export const groupIssuesByIndex = (
  issues: Array<{ path: string; message: string }>,
  collection: (typeof EDITOR_INDEXED_COLLECTIONS)[number],
): Record<number, string[]> => {
  const byIndex: Record<number, string[]> = {}
  const pattern = new RegExp(`^${collection}\\.(\\d+)(?:\\.(.*))?$`)
  for (const issue of issues) {
    const match = pattern.exec(issue.path)
    if (!match) {
      continue
    }
    const index = Number(match[1])
    const detail = match[2] ? `${match[2]}: ${issue.message}` : issue.message
    byIndex[index] = [...(byIndex[index] ?? []), detail]
  }
  return byIndex
}
