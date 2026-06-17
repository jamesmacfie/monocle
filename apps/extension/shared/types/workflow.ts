// Architecture: shared/ type layer. The DOM workflow vocabulary — the typed
// step model executed content-side by content/workflow/ (WorkflowExecutor).
// This union deliberately contains ONLY content-executable operations: every
// op here has a matching executor case and public-schema entry (the lockstep
// invariant in docs/workflow-automation.md). Privileged operations (navigate,
// open URL, clipboard write, run command) are NOT workflow steps — they are
// automation engine operations executed in the background between content
// segments (background/automations/engine.ts).

/** Root workflow definition sent to the content executor. */
export type Workflow = {
  version: "1.0"
  name?: string
  // Initial variable bindings. String fields arrive already interpolated —
  // the background engine expands {{var}} templates before lowering; the
  // executor never performs template expansion. Vars exist here so getText
  // extractions have a bag to write into and to seed pre-extracted values.
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

/**
 * Steps (union). Every member is implemented by content/workflow/ — adding a
 * member requires the executor case, the schema entry in
 * shared/types/workflowValidation.ts, and tests, in one change.
 */
export type Step =
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
  | GetTextStep
  | RemoveElementStep
  | HideElementStep
  | InjectCssStep

/** Waiting (common commands) */
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

/** Interactions */
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
  text: string // arrives already interpolated (see Workflow.vars)
  // 'select-all' (default) and 'backspace' replace the existing value;
  // 'none' appends to it.
  clear?: "none" | "select-all" | "backspace"
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
  target: Selector // <select>
  by: { value?: string; label?: string; index?: number }
  fireChange?: boolean // default true
}

export type CheckStep = BaseStep & { op: "check"; target: Selector }

export type UncheckStep = BaseStep & { op: "uncheck"; target: Selector }

export type SubmitStep = BaseStep & {
  op: "submit"
  target: Selector // <form>; if not a form, executor submits the closest form
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

/**
 * Data extraction. Reads text/an attribute into the workflow var bag; the
 * final var values are returned on WorkflowResult.vars so the background
 * engine can thread extractions across segments and into conditions.
 */
export type GetTextStep = BaseStep & {
  op: "getText"
  from: Selector
  attr?: "value" | "textContent" | string // default 'textContent'
  toVar: string // stores into workflow vars
}

/** DOM cleanup & restyling */
export type RemoveElementStep = BaseStep & {
  op: "removeElement"
  target: Selector
  all?: boolean // remove every match, not just the first
}

export type HideElementStep = BaseStep & {
  op: "hideElement"
  target: Selector
  all?: boolean
  // Groups injected hide rules under one <style data-monocle-style="key">
  // element so a caller (e.g. a automation) can scope its page edits.
  scopeKey?: string
}

export type InjectCssStep = BaseStep & {
  op: "injectCss"
  css: string
  scopeKey?: string // same scoping as hideElement
}

/** Workflow execution result */
export type WorkflowResult = {
  success: boolean
  error?: string
  stepResults?: StepResult[]
  // Final variable values (initial vars plus getText extractions),
  // stringified. Present on success and failure so partial extractions are
  // still visible to the caller.
  vars?: Record<string, string>
}

export type StepResult = {
  stepId?: string
  success: boolean
  error?: string
  duration?: number
}
