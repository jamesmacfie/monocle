// Architecture: options/ page-local helpers for the Automations builder.
// Bridges the stored `UserScript` document model (shared/types/userScripts.ts)
// and the editable form state in UserScriptEditorPage: rows for steps,
// triggers, and variables, defaults for newly added entries, and assembly of
// the form state back into a draft for `validateUserScriptDraft`. Control-flow
// steps (branch/forEach/while) and ops without a dedicated form deliberately
// round-trip as JSON rows — the document stays the source of truth and
// nothing is silently dropped. Pure data transforms only; no React, no
// messaging.
import type {
  ColorName,
  IconName,
  UserScript,
  UserScriptStep,
  UserScriptTrigger,
  UserScriptTriggerType,
  UserScriptVarDef,
} from "../../../shared/types"
import type { UserScriptDraft } from "../../../shared/types/userScriptValidation"
import type { Selector } from "../../../shared/types/workflow"
import {
  interpolatableStrings,
  walkUserScriptSteps,
} from "../../../shared/utils/user-script-introspection"
import { collectTemplateReferences } from "../../../shared/utils/user-script-template"

// ---------------------------------------------------------------------------
// Row state

export type StepRowState =
  | { kind: "form"; step: UserScriptStep }
  | {
      kind: "json"
      text: string
      // Last successfully parsed value (kept while the textarea holds invalid
      // JSON so assembly can report a row error instead of crashing).
      parsed: UserScriptStep | null
      error: string | null
    }

export type TriggerRowState = {
  trigger: UserScriptTrigger
  // Manual triggers only: the raw parameters JSON being edited (parsed on
  // blur; empty means "no parameters").
  paramsText: string
  paramsError: string | null
}

export type VarRowState = {
  name: string
  def: UserScriptVarDef
}

export type EditorDraftState = {
  name: string
  description: string
  icon: IconName | ""
  color: ColorName | ""
  enabled: boolean
  allowText: string
  denyText: string
  triggers: TriggerRowState[]
  vars: VarRowState[]
  steps: StepRowState[]
  // Preserved verbatim across edits so saving never drops them.
  options?: UserScript["options"]
  source?: UserScript["source"]
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

export const TRIGGER_TYPE_LABELS: Record<UserScriptTriggerType, string> = {
  manual: "Manual (run from the palette)",
  urlMatch: "URL match (page opens in scope)",
  elementAppears: "Element appears",
  interval: "Repeating interval",
  schedule: "Daily schedule",
  onStartup: "Browser startup",
}

export const TRIGGER_TYPES: UserScriptTriggerType[] = [
  "manual",
  "urlMatch",
  "elementAppears",
  "interval",
  "schedule",
  "onStartup",
]

export const createDefaultSelector = (): Selector => ({
  strategy: "css",
  value: "",
})

export const createDefaultTrigger = (
  type: UserScriptTriggerType,
): UserScriptTrigger => {
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
  trigger: UserScriptTrigger,
): TriggerRowState => ({
  trigger,
  paramsText:
    trigger.type === "manual" && trigger.parameters
      ? JSON.stringify(trigger.parameters, null, 2)
      : "",
  paramsError: null,
})

// ---------------------------------------------------------------------------
// Steps

// Ops with a dedicated form row. Everything else (control flow, the
// keyboard-oriented type/key ops) edits as JSON.
const FORM_OPS = new Set<string>([
  "click",
  "fill",
  "wait",
  "getText",
  "removeElement",
  "hideElement",
  "injectCss",
  "toast",
  "setVariable",
  "insertSnippet",
  "navigate",
  "openUrl",
  "clipboardWrite",
  "runCommand",
  "select",
  "check",
  "uncheck",
  "submit",
  "focus",
  "blur",
  "hover",
  "scroll",
])

export const STEP_OP_OPTIONS: Array<{ op: string; label: string }> = [
  { op: "click", label: "Click element" },
  { op: "fill", label: "Fill field" },
  { op: "select", label: "Select dropdown option" },
  { op: "check", label: "Check checkbox" },
  { op: "uncheck", label: "Uncheck checkbox" },
  { op: "submit", label: "Submit form" },
  { op: "focus", label: "Focus element" },
  { op: "blur", label: "Blur element" },
  { op: "hover", label: "Hover element" },
  { op: "scroll", label: "Scroll" },
  { op: "wait", label: "Wait" },
  { op: "getText", label: "Read text into variable" },
  { op: "removeElement", label: "Remove element" },
  { op: "hideElement", label: "Hide element" },
  { op: "injectCss", label: "Inject CSS" },
  { op: "toast", label: "Show toast" },
  { op: "setVariable", label: "Set variable" },
  { op: "insertSnippet", label: "Insert snippet" },
  { op: "navigate", label: "Navigate this tab" },
  { op: "openUrl", label: "Open URL" },
  { op: "clipboardWrite", label: "Write to clipboard" },
  { op: "runCommand", label: "Run Monocle command" },
  { op: "branch", label: "Branch (edit as JSON)" },
  { op: "forEach", label: "For each (edit as JSON)" },
  { op: "while", label: "While (edit as JSON)" },
]

const jsonRowFromStep = (step: UserScriptStep): StepRowState => ({
  kind: "json",
  text: JSON.stringify(step, null, 2),
  parsed: step,
  error: null,
})

export const stepRowFromStep = (step: UserScriptStep): StepRowState => {
  // Scroll positions beyond the simple keywords have no form fields; keep
  // them as JSON so they round-trip unchanged.
  if (step.op === "scroll" && typeof step.to !== "string") {
    return jsonRowFromStep(step)
  }
  if (!FORM_OPS.has(step.op)) {
    return jsonRowFromStep(step)
  }
  return { kind: "form", step }
}

export const createDefaultStepRow = (op: string): StepRowState => {
  switch (op) {
    case "click":
      return { kind: "form", step: { op, target: createDefaultSelector() } }
    case "fill":
      return {
        kind: "form",
        step: { op, target: createDefaultSelector(), text: "" },
      }
    case "select":
      return {
        kind: "form",
        step: { op, target: createDefaultSelector(), by: { value: "" } },
      }
    case "check":
    case "uncheck":
    case "submit":
    case "focus":
    case "blur":
    case "hover":
      return { kind: "form", step: { op, target: createDefaultSelector() } }
    case "scroll":
      return { kind: "form", step: { op, to: "bottom" } }
    case "wait":
      return { kind: "form", step: { op, for: { timeMs: 500 } } }
    case "getText":
      return {
        kind: "form",
        step: { op, from: createDefaultSelector(), toVar: "result" },
      }
    case "removeElement":
    case "hideElement":
      return { kind: "form", step: { op, target: createDefaultSelector() } }
    case "injectCss":
      return { kind: "form", step: { op, css: "" } }
    case "toast":
      return { kind: "form", step: { op, message: "" } }
    case "setVariable":
      return { kind: "form", step: { op, name: "", value: "" } }
    case "insertSnippet":
      return { kind: "form", step: { op, snippetId: "" } }
    case "navigate":
      return { kind: "form", step: { op, url: "" } }
    case "openUrl":
      return { kind: "form", step: { op, url: "" } }
    case "clipboardWrite":
      return { kind: "form", step: { op, text: "" } }
    case "runCommand":
      return { kind: "form", step: { op, commandId: "" } }
    case "branch":
      return jsonRowFromStep({
        op: "branch",
        if: { kind: "urlIncludes", value: "example.com" },
        then: [{ op: "toast", message: "Matched" }],
        else: [],
      })
    case "forEach":
      return jsonRowFromStep({
        op: "forEach",
        over: { elements: { strategy: "css", value: "li" } },
        as: "item",
        steps: [{ op: "toast", message: "{{item}}" }],
      })
    case "while":
      return jsonRowFromStep({
        op: "while",
        condition: {
          kind: "elementExists",
          selector: { strategy: "css", value: ".spinner" },
        },
        maxIterations: 50,
        steps: [{ op: "wait", for: { timeMs: 500 } }],
      })
    default:
      return { kind: "form", step: { op: "toast", message: "" } }
  }
}

// ---------------------------------------------------------------------------
// State construction

export const createEmptyEditorState = (): EditorDraftState => ({
  name: "",
  description: "",
  icon: "Workflow",
  color: "",
  enabled: true,
  allowText: "",
  denyText: "",
  triggers: [triggerRowFromTrigger({ type: "manual" })],
  vars: [],
  steps: [createDefaultStepRow("toast")],
})

export const editorStateFromScript = (
  script: UserScript,
): EditorDraftState => ({
  name: script.name,
  description: script.description ?? "",
  icon: script.icon ?? "",
  color: script.color ?? "",
  enabled: script.enabled,
  allowText: (script.urlRules?.allowUrls ?? []).join("\n"),
  denyText: (script.urlRules?.denyUrls ?? []).join("\n"),
  triggers: script.triggers.map(triggerRowFromTrigger),
  vars: Object.entries(script.vars ?? {}).map(([name, def]) => ({
    name,
    def,
  })),
  steps: script.steps.map(stepRowFromStep),
  options: script.options,
  source: script.source,
})

// ---------------------------------------------------------------------------
// Assembly back into a draft document

const parsePatterns = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

export type AssembledDraft = {
  // Null when a JSON step row has never parsed (nothing sensible to
  // validate). Otherwise the draft object to feed validateUserScriptDraft.
  draft: unknown | null
  // Row-level problems the Zod schema cannot see (bad JSON text, duplicate
  // variable names, bad parameter JSON). Non-empty blocks saving.
  issues: string[]
}

export const assembleDraft = (state: EditorDraftState): AssembledDraft => {
  const issues: string[] = []

  const steps: UserScriptStep[] = []
  let stepsComplete = true
  state.steps.forEach((row, index) => {
    if (row.kind === "form") {
      steps.push(row.step)
      return
    }
    if (row.error) {
      issues.push(`Step ${index + 1}: ${row.error}`)
    }
    if (row.parsed === null) {
      stepsComplete = false
      return
    }
    steps.push(row.parsed)
  })

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

  if (!stepsComplete) {
    return { draft: null, issues }
  }

  const allowUrls = parsePatterns(state.allowText)
  const denyUrls = parsePatterns(state.denyText)

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
    steps,
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
export const collectTemplateWarnings = (draft: UserScriptDraft): string[] => {
  const known = new Set(Object.keys(draft.vars ?? {}))
  known.add("item")
  known.add("index")

  walkUserScriptSteps(draft.steps, (step) => {
    if (step.op === "forEach" && step.as) {
      known.add(step.as)
    }
  })

  const unknown = new Set<string>()
  walkUserScriptSteps(draft.steps, (step) => {
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
