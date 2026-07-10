// Architecture: options/ page-local registry for automation step editing.
// Each form op owns its label, valid default, and React form in one typed
// entry; JSON-only ops own their label and valid default here as well. The
// editor shell consumes only the derived option list and registry lookup, so
// adding an op cannot silently miss a parallel switch. See docs/automations.md.
import type { ReactElement } from "react"
import type { AutomationStep, Snippet } from "../../../../shared/types"
import { engineStepEditors } from "./engineSteps"
import { interactionStepEditors } from "./interactionSteps"
import { observationStepEditors } from "./observationSteps"
import { outboundStepEditors } from "./outboundSteps"
import { pageEditStepEditors } from "./pageEditSteps"
import {
  FORM_STEP_OPS,
  type FormOp,
  type StepEditorEntry,
  type StepRowState,
} from "./types"

export {
  createDefaultSelector,
  type FormOp,
  type StepRowState,
} from "./types"

export const STEP_EDITORS = {
  ...interactionStepEditors,
  ...observationStepEditors,
  ...pageEditStepEditors,
  ...engineStepEditors,
  ...outboundStepEditors,
} satisfies { [Op in FormOp]: StepEditorEntry<Op> }

type JsonOp = Exclude<AutomationStep["op"], FormOp>
type JsonStepEditorEntry<Op extends JsonOp> = {
  label: string
  createDefaultJson: () => Extract<AutomationStep, { op: Op }>
}

const JSON_STEP_EDITORS = {
  type: {
    label: "Type keys (edit as JSON)",
    createDefaultJson: () => ({
      op: "type",
      target: { strategy: "css", value: "input" },
      keys: ["hello world"],
    }),
  },
  key: {
    label: "Press keys (edit as JSON)",
    createDefaultJson: () => ({ op: "key", keys: ["Enter"] }),
  },
  hideSurface: {
    label: "Hide surface (edit as JSON)",
    createDefaultJson: () => ({
      op: "hideSurface",
      surfaceId: "notice",
    }),
  },
  branch: {
    label: "Branch (edit as JSON)",
    createDefaultJson: () => ({
      op: "branch",
      if: { kind: "urlIncludes", value: "example.com" },
      then: [{ op: "toast", message: "Matched" }],
      else: [],
    }),
  },
  forEach: {
    label: "For each (edit as JSON)",
    createDefaultJson: () => ({
      op: "forEach",
      over: { elements: { strategy: "css", value: "li" } },
      as: "item",
      steps: [{ op: "toast", message: "{{item}}" }],
    }),
  },
  while: {
    label: "While (edit as JSON)",
    createDefaultJson: () => ({
      op: "while",
      condition: {
        kind: "elementExists",
        selector: { strategy: "css", value: ".spinner" },
      },
      maxIterations: 50,
      steps: [{ op: "wait", for: { timeMs: 500 } }],
    }),
  },
} satisfies { [Op in JsonOp]: JsonStepEditorEntry<Op> }

const STEP_OP_ORDER = [
  "click",
  "fill",
  "type",
  "key",
  "select",
  "check",
  "uncheck",
  "submit",
  "focus",
  "blur",
  "hover",
  "scroll",
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
  "httpRequest",
  "showSurface",
  "hideSurface",
  "branch",
  "forEach",
  "while",
] as const satisfies readonly AutomationStep["op"][]

export const STEP_OP_OPTIONS = STEP_OP_ORDER.map((op) => ({
  op,
  label:
    op in STEP_EDITORS
      ? STEP_EDITORS[op as FormOp].label
      : JSON_STEP_EDITORS[op as JsonOp].label,
}))

export const FORM_OPS: ReadonlySet<string> = new Set(FORM_STEP_OPS)

type AnyStepEditorEntry = {
  label: string
  createDefault: () => AutomationStep
  Form: (props: {
    step: AutomationStep
    snippets: Snippet[]
    update: (step: AutomationStep) => void
  }) => ReactElement | null
}

export const getStepEditor = (
  op: AutomationStep["op"],
): AnyStepEditorEntry | null => {
  if (!FORM_OPS.has(op)) {
    return null
  }
  // A Record keyed by a discriminated union cannot preserve the correlation
  // between the selected key and its component props. Keep that cast here so
  // every registry entry remains strictly checked at declaration time.
  return STEP_EDITORS[op as FormOp] as unknown as AnyStepEditorEntry
}

export const jsonStepRow = (step: AutomationStep): StepRowState => ({
  kind: "json",
  text: JSON.stringify(step, null, 2),
  parsed: step,
  error: null,
})

export const createDefaultStepRow = (
  op: AutomationStep["op"],
): StepRowState => {
  const editor = getStepEditor(op)
  if (editor) {
    return { kind: "form", step: editor.createDefault() }
  }

  return jsonStepRow(JSON_STEP_EDITORS[op as JsonOp].createDefaultJson())
}
