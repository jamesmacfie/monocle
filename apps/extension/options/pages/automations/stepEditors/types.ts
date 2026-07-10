import type { ReactElement } from "react"
import type { AutomationStep, Snippet } from "../../../../shared/types"
import type { Selector } from "../../../../shared/types/workflow"

export const FORM_STEP_OPS = [
  "click",
  "fill",
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
  "showSurface",
  "httpRequest",
] as const satisfies readonly AutomationStep["op"][]

export type FormOp = (typeof FORM_STEP_OPS)[number]

export type StepRowState =
  | { kind: "form"; step: AutomationStep }
  | {
      kind: "json"
      text: string
      // Retain the last valid value while the textarea is invalid so draft
      // assembly can report the row error without losing document data.
      parsed: AutomationStep | null
      error: string | null
    }

export type StepFormProps<Op extends FormOp> = {
  step: Extract<AutomationStep, { op: Op }>
  snippets: Snippet[]
  update: (step: AutomationStep) => void
}

export type StepEditorEntry<Op extends FormOp> = {
  label: string
  createDefault: () => Extract<AutomationStep, { op: Op }>
  Form: (props: StepFormProps<Op>) => ReactElement | null
}

export type StepEditorMap<Ops extends FormOp> = {
  [Op in Ops]: StepEditorEntry<Op>
}

export const createDefaultSelector = (): Selector => ({
  strategy: "css",
  value: "",
})
