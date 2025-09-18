// DOM Workflow types for content script automation
// Based on dom-interactions.md specification

/** Root workflow definition */
export type Workflow = {
  version: "1.0"
  name?: string
  // Variables are expanded in string fields via {{var}} before execution
  vars?: Record<string, string | number | boolean | null>
  steps: Step[]
}

/** Base step & common configuration */
type RetryPolicy = {
  retries: number // e.g., 2
  delayMs?: number // ms between retries
  backoff?: "none" | "exponential"
}

type TargetingOpts = {
  // If true, scroll element into view before action
  scrollIntoView?: boolean // default true
  // If true, ensure element is visible (non-zero rect, not display:none/visibility:hidden)
  ensureVisible?: boolean // default true
}

export type BaseStep = {
  op: string // discriminant
  id?: string // optional for reporting
  description?: string
  timeoutMs?: number // per-step timeout
  retry?: RetryPolicy // per-step retry
  targeting?: TargetingOpts
}

/** Selectors (CSS | text) */
export type Selector =
  | { strategy: "css"; value: string; index?: number }
  | {
      strategy: "text"
      value: string // text to match
      exact?: boolean // default false (substring match)
      within?: Selector // limit search scope
      index?: number // pick Nth match after filtering
    }

/** Steps (union) */
export type Step =
  | NavigateStep
  | WaitStep
  | ClickStep
  | HoverStep
  | FocusStep
  | BlurStep
  | FillStep
  | TypeStep
  | KeyComboStep
  | SelectStep
  | CheckStep
  | UncheckStep
  | SubmitStep
  | ScrollStep
  | CopyStep
  | ClipboardWriteStep

/** 1) Navigation (performed via background; no implicit waits) */
export type NavigateStep = BaseStep & {
  op: "navigate"
  url: string // absolute or relative
  // No wait semantics here; chain a WaitStep next if needed
}

/** 2) Waiting (common commands) */
export type WaitStep = BaseStep & {
  op: "wait"
  for:
    | { timeMs: number } // simple sleep
    | {
        selector: Selector
        state?: "attached" | "visible" | "hidden" | "detached" // default 'visible'
      }
    | { urlIncludes: string } // poll location.href
    | { readyState: "loading" | "interactive" | "complete" } // document.readyState
}

/** 3) Interactions */
export type ClickStep = BaseStep & {
  op: "click"
  target: Selector
  button?: "left" | "middle" | "right"
  clickCount?: 1 | 2
  delayMs?: number // between down/up
  modifiers?: Array<"Alt" | "Control" | "Meta" | "Shift">
}

export type HoverStep = BaseStep & { op: "hover"; target: Selector }

export type FocusStep = BaseStep & { op: "focus"; target: Selector }

export type BlurStep = BaseStep & { op: "blur"; target: Selector }

export type FillStep = BaseStep & {
  op: "fill"
  target: Selector
  text: string // after {{}} expansion
  clear?: "none" | "select-all" | "backspace" // default 'select-all'
  // Fire events after setting value; defaults to both true
  fire?: { input?: boolean; change?: boolean }
}

export type TypeStep = BaseStep & {
  op: "type"
  target: Selector
  keys: Array<string> // e.g., ["Control","A","Backspace","hello world"]
  delayMs?: number // per key
}

export type KeyComboStep = BaseStep & {
  op: "key"
  keys: Array<string> // sent to document.activeElement
  delayMs?: number
}

export type SelectStep = BaseStep & {
  op: "select"
  target: Selector // <select> or ARIA combobox (best-effort)
  by: { value?: string; label?: string; index?: number }
  fireChange?: boolean // default true
}

export type CheckStep = BaseStep & { op: "check"; target: Selector }

export type UncheckStep = BaseStep & { op: "uncheck"; target: Selector }

export type SubmitStep = BaseStep & {
  op: "submit"
  target: Selector // <form>; if not a form, executor should try to find [type=submit]
}

export type ScrollStep = BaseStep & {
  op: "scroll"
  target?: Selector // if omitted, scroll window
  to:
    | "top"
    | "bottom"
    | "center"
    | { x: number; y: number }
    | { intoView: true }
  behavior?: "auto" | "smooth"
}

/** 4) Data extraction & clipboard (write only) */
export type CopyStep = BaseStep & {
  op: "copy"
  from: Selector
  attr?: "value" | "textContent" | string // default 'textContent'
  toVar: string // stores into workflow vars
}

export type ClipboardWriteStep = BaseStep & {
  op: "clipboard.write"
  text: string // after template expansion
  viaBackground?: boolean // prefer true for robustness
}

/** Background messaging for privileged operations */
export type BgMessage =
  | { type: "tabs.navigate"; url: string } // navigate current tab
  | { type: "clipboard.write"; text: string }

export type BgResponse =
  | { ok: true; result?: any }
  | { ok: false; error: string }

/** Workflow execution result */
export type WorkflowResult = {
  success: boolean
  error?: string
  stepResults?: StepResult[]
}

export type StepResult = {
  stepId?: string
  success: boolean
  error?: string
  duration?: number
}
