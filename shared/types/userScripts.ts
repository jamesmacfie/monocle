// Architecture: shared/ type layer. The `UserScript` document model — the
// stored, declarative description of a user-authored automation. A user
// script is always data, never code: it is persisted locally under the
// `monocle-userscripts` storage key (background/userScripts/storage.ts),
// validated against shared/types/userScriptValidation.ts at every boundary,
// and interpreted entirely by bundled extension logic
// (background/userScripts/engine.ts lowers content steps onto the workflow
// vocabulary in shared/types/workflow.ts). That framing is load-bearing for
// store policy: documents are configuration with fixed verbs, capped
// nesting, and capped loops — not a language. See docs/user-scripts.md.
import type { ColorName, UrlRules } from "./commands"
import type { IconName } from "./icons"
import type { Selector } from "./workflow"

// ---------------------------------------------------------------------------
// Variables

export type UserScriptVarDef =
  // A fixed string baked into the document.
  | { kind: "literal"; value: string }
  // Resolved + placeholder-interpolated at run time via the snippets module;
  // referencing by stable id means deleting the snippet surfaces a builder
  // warning rather than silently changing behavior.
  | { kind: "snippet"; snippetId: string }
  // Set during the run by getText/setVariable steps; empty until set.
  | { kind: "runtime" }

// ---------------------------------------------------------------------------
// Triggers — when a script runs. v1 ships `manual` only (zero non-gesture
// execution); urlMatch/elementAppears are the v2 event triggers and
// interval/schedule/onStartup the v3 scheduled triggers. Non-manual triggers
// carry `disarmed` so imported documents arrive inert until the user
// reviews and arms them (the import-safety contract in docs/user-scripts.md).

// Prompt-before-run parameter: a deliberately constrained FormField subset
// (simple inputs only) so imported documents stay reviewable. Rendered via
// the existing inline-input system (shared/types/ui.ts FormField).
export type UserScriptParameterField = {
  id: string
  label: string
  required?: boolean
} & (
  | {
      type: "text" | "textarea"
      placeholder?: string
      defaultValue?: string
    }
  | {
      type: "select"
      options?: Array<{ value: string; label: string }>
      placeholder?: string
      defaultValue?: string
    }
)

export type ManualTrigger = {
  type: "manual"
  // Prompt-before-run parameters: a manual trigger with parameters renders
  // as a form (group of input nodes + submit) instead of a plain action.
  // Values land in interpolation as {{params.<id>}}.
  parameters?: UserScriptParameterField[]
}

export type UrlMatchTrigger = {
  type: "urlMatch"
  // The script's urlRules ARE the pattern — there is deliberately no
  // separate match field. `load` fires when a matching page finishes
  // loading; `spa` on best-effort history-API navigation onto a match.
  on?: Array<"load" | "spa">
  oncePerPage?: boolean // default true; resets on real navigation
  delayMs?: number // settle delay after match; default 0, max 10000
  disarmed?: boolean
}

export type ElementAppearsTrigger = {
  type: "elementAppears"
  selector: Selector
  oncePerPage?: boolean // default true
  throttleMs?: number // default 1000, floor 250 (observer-storm guard)
  disarmed?: boolean
}

export type IntervalTrigger = {
  type: "interval"
  everyMinutes: number // floor 1 (chrome.alarms minimum)
  disarmed?: boolean
}

export type ScheduleTrigger = {
  type: "schedule"
  at: string // "HH:MM" local time, fired daily
  disarmed?: boolean
}

export type StartupTrigger = {
  type: "onStartup"
  disarmed?: boolean
}

export type UserScriptTrigger =
  | ManualTrigger
  | UrlMatchTrigger
  | ElementAppearsTrigger
  | IntervalTrigger
  | ScheduleTrigger
  | StartupTrigger

export type UserScriptTriggerType = UserScriptTrigger["type"]

// ---------------------------------------------------------------------------
// Conditions — evaluated by the engine; element conditions are answered by
// the content executor's selector machinery (probe steps), var conditions
// engine-side after interpolation.

export type UserScriptComparisonOperator =
  | "equals"
  | "equalsIgnoreCase"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan" // numeric coercion; non-numeric fails the run loudly
  | "lessThan"

export type UserScriptCondition =
  | { kind: "elementExists"; selector: Selector }
  | { kind: "elementVisible"; selector: Selector }
  | {
      kind: "elementText"
      selector: Selector
      operator: UserScriptComparisonOperator
      value: string
    }
  | { kind: "urlIncludes"; value: string }
  | {
      kind: "varCompare"
      name: string
      operator: UserScriptComparisonOperator
      value: string
    }
  // Pattern length capped, no user-supplied flags (ReDoS containment).
  | { kind: "varMatches"; name: string; pattern: string }
  | { kind: "not"; of: UserScriptCondition }
  | { kind: "allOf"; of: UserScriptCondition[] }
  | { kind: "anyOf"; of: UserScriptCondition[] }

// ---------------------------------------------------------------------------
// Steps. Content steps reuse the workflow vocabulary verbatim — they lower
// 1:1 onto shared/types/workflow.ts steps and run in
// content/workflow/executor.ts. Engine steps execute in the background
// between content segments (privileged APIs, snippets, control flow).

import type { Step as WorkflowStep } from "./workflow"

// Workflow ops a user script may embed directly. (The full workflow union is
// reused; the validation schema is the enforcement surface for caps.)
export type UserScriptContentStep = WorkflowStep

type EngineStepBase = {
  id?: string
  description?: string
}

export type SetVariableStep = EngineStepBase & {
  op: "setVariable"
  name: string
  value: string // interpolated
}

export type InsertSnippetStep = EngineStepBase & {
  op: "insertSnippet"
  snippetId: string
  // Without a target: inserts at the page's last-focused editable element
  // via the monocle-insertText path (clipboard fallback), identical to the
  // Insert Snippet palette command. With a target: behaves like fill with
  // the interpolated snippet body.
  target?: Selector
}

export type ToastStep = EngineStepBase & {
  op: "toast"
  level?: "info" | "success" | "error"
  message: string // interpolated
}

export type NavigateStep = EngineStepBase & {
  op: "navigate"
  url: string // interpolated; navigates the run's pinned tab
}

export type OpenUrlStep = EngineStepBase & {
  op: "openUrl"
  url: string // interpolated
  disposition?: "currentTab" | "newTab" | "newWindow"
}

export type ClipboardWriteStep = EngineStepBase & {
  op: "clipboardWrite"
  text: string // interpolated
}

export type RunCommandStep = EngineStepBase & {
  op: "runCommand"
  // Deny rules validated at save and re-checked at execute time; non-manual
  // runs are further restricted to a static allowlist
  // (background/userScripts/runCommandPolicy.ts).
  commandId: string
}

export type BranchStep = EngineStepBase & {
  op: "branch"
  if: UserScriptCondition
  then: UserScriptStep[]
  else?: UserScriptStep[]
}

export type ForEachStep = EngineStepBase & {
  op: "forEach"
  // Elements: iterate current matches of a selector; body steps whose
  // selectors equal the loop selector are pinned to the current match each
  // iteration, and {{item}} (or the `as` name) holds its text. Variable:
  // iterate the lines of a variable's value.
  over: { elements: Selector } | { variable: string }
  as?: string // default "item"; index exposed as {{index}}
  maxIterations?: number // default 50, hard max 1000
  steps: UserScriptStep[]
}

export type WhileStep = EngineStepBase & {
  op: "while"
  condition: UserScriptCondition
  maxIterations?: number // default 50, hard max 1000 — loops always terminate
  steps: UserScriptStep[]
}

export type UserScriptEngineStep =
  | SetVariableStep
  | InsertSnippetStep
  | ToastStep
  | NavigateStep
  | OpenUrlStep
  | ClipboardWriteStep
  | RunCommandStep
  | BranchStep
  | ForEachStep
  | WhileStep

export type UserScriptStep = UserScriptContentStep | UserScriptEngineStep

// ---------------------------------------------------------------------------
// The document

export interface UserScript {
  id: string // crypto.randomUUID(); the generated command id suffix
  schemaVersion: 1 // explicit migration anchor
  name: string
  description?: string
  // Lucide name / preset color only — user-script documents are importable
  // data, so free-form SVG/URL icons are an avoided sanitization surface.
  icon?: IconName
  color?: ColorName
  // Master switch: a disabled script generates no palette command and arms
  // no triggers.
  enabled: boolean
  // Scopes BOTH the palette row and trigger eligibility; reuses the command
  // URL-rule engine and precedence (docs/url-filtering.md).
  urlRules?: UrlRules
  triggers: UserScriptTrigger[] // at least one
  vars?: Record<string, UserScriptVarDef>
  steps: UserScriptStep[]
  options?: {
    // Success/error toast on completion (default true).
    showResultToast?: boolean
  }
  createdAt: number
  updatedAt: number
  // Import provenance for the trust model; imported scripts arrive with
  // non-manual triggers disarmed.
  source?: {
    kind: "local" | "imported"
    importedAt?: number
  }
}

// Keybindings/hidden/favorites intentionally do NOT live on the document —
// the generated command id (`userscript-<uuid>`) participates in the
// existing CommandSettings/favorites machinery, exactly like snippet rows.

// ---------------------------------------------------------------------------
// Runtime exchange shapes

/** Aggregated result of one engine run (across all segments). */
export type UserScriptRunResult = {
  success: boolean
  error?: string
  // Count of executed steps (engine + content), for the result toast and
  // the builder's test-run display.
  completedSteps: number
  // Per-step outcomes in execution order. Step payloads are never echoed
  // back — labels only — so interpolated secrets stay out of logs.
  stepOutcomes?: Array<{
    op: string
    id?: string
    success: boolean
    error?: string
  }>
}

/**
 * What a page needs to arm one non-manual trigger: sent by the background
 * trigger engine in response to get-user-script-triggers. Content never
 * receives steps — it only reports fires back for re-validation.
 */
export type UserScriptPageTriggerSpec = {
  scriptId: string
  trigger: UrlMatchTrigger | ElementAppearsTrigger
}

/** Generated command id for a script. */
export const userScriptCommandId = (scriptId: string): string =>
  `userscript-${scriptId}`

/** Inverse of userScriptCommandId; null when the id is not a script row. */
export const parseUserScriptCommandId = (commandId: string): string | null =>
  commandId.startsWith("userscript-")
    ? commandId.slice("userscript-".length)
    : null
