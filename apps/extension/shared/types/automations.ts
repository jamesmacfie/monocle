// Architecture: shared/ type layer. The `Automation` document model — the
// stored, declarative description of a user-authored automation. A user
// automation is always data, never code: it is persisted locally under the
// `monocle-automations` storage key (background/automations/storage.ts),
// validated against shared/types/automationValidation.ts at every boundary,
// and interpreted entirely by bundled extension logic
// (background/automations/engine.ts lowers content steps onto the workflow
// vocabulary in shared/types/workflow.ts). That framing is load-bearing for
// store policy: documents are configuration with fixed verbs, capped
// nesting, and capped loops — not a language. See docs/automations.md.
import type { ColorName, UrlRules } from "./commands"
import type { IconName } from "./icons"
import type {
  InlinePlacement,
  SurfaceActionDescriptor,
  SurfaceContent,
  SurfaceUrlMatch,
} from "./surface"
import type { Selector } from "./workflow"

// ---------------------------------------------------------------------------
// Variables

export type AutomationVarDef =
  // A fixed string baked into the document.
  | { kind: "literal"; value: string }
  // Resolved + placeholder-interpolated at run time via the snippets module;
  // referencing by stable id means deleting the snippet surfaces a builder
  // warning rather than silently changing behavior.
  | { kind: "snippet"; snippetId: string }
  // Set during the run by getText/setVariable steps; empty until set.
  | { kind: "runtime" }

// ---------------------------------------------------------------------------
// Triggers — when an automation runs. v1 ships `manual` only (zero non-gesture
// execution); urlMatch/elementAppears are the v2 event triggers and
// interval/schedule/onStartup the v3 scheduled triggers. Non-manual triggers
// carry `disarmed` so imported documents arrive inert until the user
// reviews and arms them (the import-safety contract in docs/automations.md).

// Prompt-before-run parameter: a deliberately constrained FormField subset
// (simple inputs only) so imported documents stay reviewable. Rendered via
// the existing inline-input system (shared/types/ui.ts FormField).
export type AutomationParameterField = {
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
  parameters?: AutomationParameterField[]
}

export type UrlMatchTrigger = {
  type: "urlMatch"
  // The automation's urlRules ARE the pattern — there is deliberately no
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

export type AutomationTrigger =
  | ManualTrigger
  | UrlMatchTrigger
  | ElementAppearsTrigger
  | IntervalTrigger
  | ScheduleTrigger
  | StartupTrigger

export type AutomationTriggerType = AutomationTrigger["type"]

// ---------------------------------------------------------------------------
// Conditions — evaluated by the engine; element conditions are answered by
// the content executor's selector machinery (probe steps), var conditions
// engine-side after interpolation.

export type AutomationComparisonOperator =
  | "equals"
  | "equalsIgnoreCase"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan" // numeric coercion; non-numeric fails the run loudly
  | "lessThan"

export type AutomationCondition =
  | { kind: "elementExists"; selector: Selector }
  | { kind: "elementVisible"; selector: Selector }
  | {
      kind: "elementText"
      selector: Selector
      operator: AutomationComparisonOperator
      value: string
    }
  | { kind: "urlIncludes"; value: string }
  | {
      kind: "varCompare"
      name: string
      operator: AutomationComparisonOperator
      value: string
    }
  // Pattern length capped, no user-supplied flags (ReDoS containment).
  | { kind: "varMatches"; name: string; pattern: string }
  | { kind: "not"; of: AutomationCondition }
  | { kind: "allOf"; of: AutomationCondition[] }
  | { kind: "anyOf"; of: AutomationCondition[] }

// ---------------------------------------------------------------------------
// Steps. Content steps reuse the workflow vocabulary verbatim — they lower
// 1:1 onto shared/types/workflow.ts steps and run in
// content/workflow/executor.ts. Engine steps execute in the background
// between content segments (privileged APIs, snippets, control flow).

import type { ClickStep, SubmitStep, Step as WorkflowStep } from "./workflow"

// Workflow ops an automation may embed directly. click/submit can add an
// automation-only orchestration hint so the background engine waits for the
// page load they trigger; the hint is stripped before reaching workflows.
export type AutomationClickStep = ClickStep & { expectNavigation?: boolean }
export type AutomationSubmitStep = SubmitStep & { expectNavigation?: boolean }
export type AutomationContentStep =
  | Exclude<WorkflowStep, ClickStep | SubmitStep>
  | AutomationClickStep
  | AutomationSubmitStep

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
  // (background/automations/runCommandPolicy.ts).
  commandId: string
}

export type AutomationSurfaceKind = "overlay" | "badge" | "inline"
export type AutomationSurfaceContent = Omit<SurfaceContent, "blocks" | "css">

export type AutomationSurfaceAction = SurfaceActionDescriptor & {
  steps: AutomationStep[]
}

// Pushes a declarative surface (overlay/badge) into the generic Surfaces store
// under this automation's owner (`automation:<id>`). The author supplies the
// surfaceId (unique within the automation); content.title/content.text are
// interpolated, urlMatch is not (an address, never a template). See
// docs/surfaces.md.
export type ShowPassiveSurfaceStep = EngineStepBase & {
  op: "showSurface"
  surfaceId: string
  kind: "overlay" | "badge"
  urlMatch?: SurfaceUrlMatch
  blocking?: boolean
  content: AutomationSurfaceContent
}

export type ShowInlineSurfaceStep = EngineStepBase & {
  op: "showSurface"
  surfaceId: string
  kind: "inline"
  urlMatch?: SurfaceUrlMatch
  placement: InlinePlacement
  content: AutomationSurfaceContent
  actions: AutomationSurfaceAction[]
}

export type ShowSurfaceStep = ShowPassiveSurfaceStep | ShowInlineSurfaceStep

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type HttpResponseMapping = {
  path: Array<string | number>
  toVar: string
  required?: boolean
}

export type HttpRequestStep = EngineStepBase & {
  op: "httpRequest"
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  headers?: Record<string, string>
  body?: JsonValue
  timeoutMs?: number
  response?: {
    statusToVar?: string
    json?: HttpResponseMapping[]
  }
}

export type HideSurfaceStep = EngineStepBase & {
  op: "hideSurface"
  surfaceId: string
}

export type BranchStep = EngineStepBase & {
  op: "branch"
  if: AutomationCondition
  then: AutomationStep[]
  else?: AutomationStep[]
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
  steps: AutomationStep[]
}

export type WhileStep = EngineStepBase & {
  op: "while"
  condition: AutomationCondition
  maxIterations?: number // default 50, hard max 1000 — loops always terminate
  steps: AutomationStep[]
}

export type AutomationEngineStep =
  | SetVariableStep
  | InsertSnippetStep
  | ToastStep
  | NavigateStep
  | OpenUrlStep
  | ClipboardWriteStep
  | RunCommandStep
  | HttpRequestStep
  | ShowSurfaceStep
  | HideSurfaceStep
  | BranchStep
  | ForEachStep
  | WhileStep

const AUTOMATION_ENGINE_OP_TABLE: Record<AutomationEngineStep["op"], true> = {
  setVariable: true,
  insertSnippet: true,
  toast: true,
  navigate: true,
  openUrl: true,
  clipboardWrite: true,
  runCommand: true,
  httpRequest: true,
  showSurface: true,
  hideSurface: true,
  branch: true,
  forEach: true,
  while: true,
}

/** Exhaustive runtime view of the steps owned by the background engine. */
export const AUTOMATION_ENGINE_OPS: ReadonlySet<string> = new Set(
  Object.keys(AUTOMATION_ENGINE_OP_TABLE),
)

export type AutomationStep = AutomationContentStep | AutomationEngineStep

// ---------------------------------------------------------------------------
// The document

export interface Automation {
  id: string // crypto.randomUUID(); the generated command id suffix
  schemaVersion: 1 // explicit migration anchor
  name: string
  description?: string
  // Lucide name / preset color only — automation documents are importable
  // data, so free-form SVG/URL icons are an avoided sanitization surface.
  icon?: IconName
  color?: ColorName
  // Master switch: a disabled automation generates no palette command and arms
  // no triggers.
  enabled: boolean
  // Scopes BOTH the palette row and trigger eligibility; reuses the command
  // URL-rule engine and precedence (docs/url-filtering.md).
  urlRules?: UrlRules
  triggers: AutomationTrigger[] // at least one
  vars?: Record<string, AutomationVarDef>
  steps: AutomationStep[]
  options?: {
    // Success/error toast on completion (default true).
    showResultToast?: boolean
  }
  createdAt: number
  updatedAt: number
  // Import provenance for the trust model; imported automations arrive with
  // non-manual triggers disarmed.
  source?: {
    kind: "local" | "imported"
    importedAt?: number
  }
  // Ownership (a separate axis from `source`, which is import provenance).
  // Absent or {kind:"user"} = a user-authored document stored in
  // `monocle-automations`. {kind:"feature"} = a read-only document PROJECTED
  // at read time from a feature's config (never persisted to the automation
  // store), letting a feature contribute page-load automations through the
  // same engine + trigger system. See docs/features.md and docs/automations.md.
  owner?: AutomationOwner
}

export type AutomationOwner =
  | { kind: "user" }
  | { kind: "feature"; featureId: string }

// Keybindings/hidden/favorites intentionally do NOT live on the document —
// the generated command id (`automation-<uuid>`) participates in the
// existing CommandSettings/favorites machinery, exactly like snippet rows.

// ---------------------------------------------------------------------------
// Runtime exchange shapes

/** Aggregated result of one engine run (across all segments). */
export type AutomationRunResult = {
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
 * trigger engine in response to get-automation-triggers. Content never
 * receives steps — it only reports fires back for re-validation.
 */
export type AutomationPageTriggerSpec = {
  automationId: string
  trigger: UrlMatchTrigger | ElementAppearsTrigger
}

/** Generated command id for an automation. */
export const automationCommandId = (automationId: string): string =>
  `automation-${automationId}`

/** Inverse of automationCommandId; null when the id is not an automation row. */
export const parseAutomationCommandId = (commandId: string): string | null =>
  commandId.startsWith("automation-")
    ? commandId.slice("automation-".length)
    : null

/** True when an automation is projected from a feature's config (read-only). */
export const isFeatureAutomation = (
  automation: Pick<Automation, "owner">,
): automation is Automation & {
  owner: { kind: "feature"; featureId: string }
} => automation.owner?.kind === "feature"

/**
 * Deterministic id for a feature-projected automation. The `feature:` prefix
 * (with `:`) cannot collide with the `crypto.randomUUID()` ids of stored user
 * documents. Keep `key` short — the document `id` is capped at 100 chars.
 */
export const featureAutomationId = (featureId: string, key: string): string =>
  `feature:${featureId}:${key}`
