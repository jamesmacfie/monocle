// Architecture: shared/ validation layer. The Zod schema for `Automation`
// documents plus the structural caps that keep them "configuration, not a
// language" (the store-policy posture in docs/automations.md). Shared so
// the options builder validates as-you-type with the identical schema the
// background enforces at the message boundary
// (background/messages/automations.ts) and at storage
// (background/automations/storage.ts) — the discipline established by the
// site SDK. The engine re-checks the structural caps at run time as defense
// in depth against direct storage tampering. Anything failing validation is
// rejected loudly with field-level errors, never coerced.
import { z } from "zod"
import {
  HTTP_MAX_HEADER_VALUE_LENGTH,
  HTTP_MAX_HEADERS,
  HTTP_REQUEST_MAX_TIMEOUT_MS,
  HTTP_REQUEST_METHODS,
  HTTP_REQUEST_MIN_TIMEOUT_MS,
  inspectHttpEndpoint,
  inspectJsonValue,
  validateHttpHeaderName,
} from "../utils/http-request-policy"
import type {
  Automation,
  AutomationCondition,
  AutomationStep,
  HttpRequestStep,
  JsonValue,
} from "./automations"
import { ICON_NAMES } from "./icons"
import {
  SurfaceContentSchema as BaseSurfaceContentSchema,
  SurfaceUrlMatchSchema as BaseSurfaceUrlMatchSchema,
} from "./surfaceValidation"
import { SelectorSchema, WorkflowStepSchema } from "./workflowValidation"

// ---------------------------------------------------------------------------
// Caps (schema-enforced; the engine re-checks the structural ones)

export const AUTOMATION_MAX_COUNT = 200
export const AUTOMATION_MAX_STEPS = 100 // counting nested steps
export const AUTOMATION_MAX_DEPTH = 3 // branch/forEach/while combined
export const AUTOMATION_LOOP_DEFAULT_ITERATIONS = 50
export const AUTOMATION_LOOP_MAX_ITERATIONS = 1000
export const AUTOMATION_MAX_TRIGGERS = 5
export const AUTOMATION_MAX_VARS = 50
export const AUTOMATION_NAME_MAX_LENGTH = 100
export const AUTOMATION_STRING_MAX_LENGTH = 2000
export const AUTOMATION_CSS_MAX_LENGTH = 10_000
export const AUTOMATION_REGEX_MAX_LENGTH = 200
export const AUTOMATION_MAX_PARAMETERS = 10
export const AUTOMATION_TRIGGER_MAX_DELAY_MS = 10_000
export const AUTOMATION_ELEMENT_APPEARS_MIN_THROTTLE_MS = 250

export const COLOR_NAMES = [
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
] as const

const BoundedString = z.string().min(1).max(AUTOMATION_STRING_MAX_LENGTH)
const VarName = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    "Variable names must start with a letter and use letters, digits, or underscores",
  )
  .max(AUTOMATION_NAME_MAX_LENGTH)

// ---------------------------------------------------------------------------
// Variables

export const AutomationVarDefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("literal"),
      value: z.string().max(AUTOMATION_STRING_MAX_LENGTH),
    })
    .strict(),
  z
    .object({ kind: z.literal("snippet"), snippetId: z.string().min(1) })
    .strict(),
  z.object({ kind: z.literal("runtime") }).strict(),
])

// ---------------------------------------------------------------------------
// Triggers. Manual-trigger parameters are a constrained FormField subset:
// prompt-before-run only needs simple inputs, and a closed set keeps
// imported documents reviewable.

const ParameterFieldSchema = z
  .object({
    id: VarName,
    label: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
    required: z.boolean().optional(),
    type: z.enum(["text", "textarea", "select"]),
    placeholder: z.string().max(AUTOMATION_NAME_MAX_LENGTH).optional(),
    defaultValue: z.string().max(AUTOMATION_STRING_MAX_LENGTH).optional(),
    options: z
      .array(
        z
          .object({
            value: z.string().max(AUTOMATION_STRING_MAX_LENGTH),
            label: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict()

const ManualTriggerSchema = z
  .object({
    type: z.literal("manual"),
    parameters: z
      .array(ParameterFieldSchema)
      .max(AUTOMATION_MAX_PARAMETERS)
      .optional(),
  })
  .strict()

const UrlMatchTriggerSchema = z
  .object({
    type: z.literal("urlMatch"),
    on: z
      .array(z.enum(["load", "spa"]))
      .min(1)
      .optional(),
    oncePerPage: z.boolean().optional(),
    delayMs: z
      .number()
      .int()
      .nonnegative()
      .max(AUTOMATION_TRIGGER_MAX_DELAY_MS)
      .optional(),
    disarmed: z.boolean().optional(),
  })
  .strict()

const ElementAppearsTriggerSchema = z
  .object({
    type: z.literal("elementAppears"),
    selector: SelectorSchema,
    oncePerPage: z.boolean().optional(),
    throttleMs: z
      .number()
      .int()
      .min(AUTOMATION_ELEMENT_APPEARS_MIN_THROTTLE_MS)
      .max(60_000)
      .optional(),
    disarmed: z.boolean().optional(),
  })
  .strict()

const IntervalTriggerSchema = z
  .object({
    type: z.literal("interval"),
    everyMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60),
    disarmed: z.boolean().optional(),
  })
  .strict()

const ScheduleTriggerSchema = z
  .object({
    type: z.literal("schedule"),
    at: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Schedule time must be HH:MM"),
    disarmed: z.boolean().optional(),
  })
  .strict()

const StartupTriggerSchema = z
  .object({
    type: z.literal("onStartup"),
    disarmed: z.boolean().optional(),
  })
  .strict()

export const AutomationTriggerSchema = z.discriminatedUnion("type", [
  ManualTriggerSchema,
  UrlMatchTriggerSchema,
  ElementAppearsTriggerSchema,
  IntervalTriggerSchema,
  ScheduleTriggerSchema,
  StartupTriggerSchema,
])

// ---------------------------------------------------------------------------
// Conditions (recursive; depth is bounded by the document-level step checks
// plus an explicit nesting cap here)

const ComparisonOperatorSchema = z.enum([
  "equals",
  "equalsIgnoreCase",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
])

export const AutomationConditionSchema: z.ZodType<AutomationCondition> = z.lazy(
  () =>
    z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("elementExists"), selector: SelectorSchema })
        .strict(),
      z
        .object({ kind: z.literal("elementVisible"), selector: SelectorSchema })
        .strict(),
      z
        .object({
          kind: z.literal("elementText"),
          selector: SelectorSchema,
          operator: ComparisonOperatorSchema,
          value: z.string().max(AUTOMATION_STRING_MAX_LENGTH),
        })
        .strict(),
      z
        .object({ kind: z.literal("urlIncludes"), value: BoundedString })
        .strict(),
      z
        .object({
          kind: z.literal("varCompare"),
          name: VarName,
          operator: ComparisonOperatorSchema,
          value: z.string().max(AUTOMATION_STRING_MAX_LENGTH),
        })
        .strict(),
      z
        .object({
          kind: z.literal("varMatches"),
          name: VarName,
          pattern: z
            .string()
            .min(1)
            .max(AUTOMATION_REGEX_MAX_LENGTH)
            .refine((pattern) => {
              try {
                // No user-supplied flags — compiled exactly as stored.
                new RegExp(pattern)
                return true
              } catch {
                return false
              }
            }, "Invalid regular expression"),
        })
        .strict(),
      z
        .object({ kind: z.literal("not"), of: AutomationConditionSchema })
        .strict(),
      z
        .object({
          kind: z.literal("allOf"),
          of: z.array(AutomationConditionSchema).min(1).max(10),
        })
        .strict(),
      z
        .object({
          kind: z.literal("anyOf"),
          of: z.array(AutomationConditionSchema).min(1).max(10),
        })
        .strict(),
    ]),
)

// ---------------------------------------------------------------------------
// Steps. Content steps reuse the workflow schema verbatim; engine steps are
// validated here. branch/forEach/while recurse through the full union.

const NonNegativeIntegerSchema = z.number().int().nonnegative()

const AutomationRetryPolicySchema = z
  .object({
    retries: NonNegativeIntegerSchema,
    delayMs: NonNegativeIntegerSchema.optional(),
    backoff: z.enum(["none", "exponential"]).optional(),
  })
  .strict()

const AutomationTargetingOptsSchema = z
  .object({
    scrollIntoView: z.boolean().optional(),
    ensureVisible: z.boolean().optional(),
  })
  .strict()

const AutomationContentStepBaseSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  timeoutMs: NonNegativeIntegerSchema.optional(),
  retry: AutomationRetryPolicySchema.optional(),
  targeting: AutomationTargetingOptsSchema.optional(),
})

const AutomationClickStepSchema = AutomationContentStepBaseSchema.extend({
  op: z.literal("click"),
  target: SelectorSchema,
  button: z.enum(["left", "middle", "right"]).optional(),
  clickCount: z.union([z.literal(1), z.literal(2)]).optional(),
  delayMs: NonNegativeIntegerSchema.optional(),
  modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional(),
  expectNavigation: z.boolean().optional(),
}).strict()

const AutomationSubmitStepSchema = AutomationContentStepBaseSchema.extend({
  op: z.literal("submit"),
  target: SelectorSchema,
  expectNavigation: z.boolean().optional(),
}).strict()

const EngineStepBaseSchema = z.object({
  id: z.string().max(AUTOMATION_NAME_MAX_LENGTH).optional(),
  description: z.string().max(AUTOMATION_STRING_MAX_LENGTH).optional(),
})

const SetVariableStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("setVariable"),
  name: VarName,
  value: z.string().max(AUTOMATION_STRING_MAX_LENGTH),
}).strict()

const InsertSnippetStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("insertSnippet"),
  snippetId: z.string().min(1),
  target: SelectorSchema.optional(),
}).strict()

const ToastStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("toast"),
  level: z.enum(["info", "success", "error"]).optional(),
  message: BoundedString,
}).strict()

const NavigateEngineStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("navigate"),
  url: BoundedString,
}).strict()

const OpenUrlStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("openUrl"),
  url: BoundedString,
  disposition: z.enum(["currentTab", "newTab", "newWindow"]).optional(),
}).strict()

const ClipboardWriteStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("clipboardWrite"),
  text: z.string().min(1).max(AUTOMATION_CSS_MAX_LENGTH),
}).strict()

const RunCommandStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("runCommand"),
  commandId: z
    .string()
    .min(1)
    .max(AUTOMATION_NAME_MAX_LENGTH * 2),
}).strict()

// Surfaces: declarative overlay/badge data (rendered by the trusted
// SurfaceHost — no markup). content.title/text are interpolated by the engine.
// These EXTEND the canonical surface schemas (./surfaceValidation, the single
// source of truth) with tighter caps on the attacker-facing free-text fields,
// so the automation shape tracks the canonical one and the two cannot drift
// (icon/countdownTo are inherited verbatim). Modal/picker-only fields
// (`blocks`, `css`) are intentionally omitted until automations support those
// surface kinds.
const SurfaceContentSchema = BaseSurfaceContentSchema.omit({
  blocks: true,
  css: true,
})
  .extend({
    title: z.string().max(AUTOMATION_STRING_MAX_LENGTH).optional(),
    text: z.string().max(AUTOMATION_STRING_MAX_LENGTH).optional(),
  })
  .strict()

const SurfaceUrlMatchSchema = BaseSurfaceUrlMatchSchema.extend({
  allowUrls: z.array(BoundedString).max(100).optional(),
  denyUrls: z.array(BoundedString).max(100).optional(),
}).strict()

const PassiveSurfaceStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("showSurface"),
  surfaceId: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
  kind: z.enum(["overlay", "badge"]),
  urlMatch: SurfaceUrlMatchSchema.optional(),
  blocking: z.boolean().optional(),
  content: SurfaceContentSchema,
}).strict()

const AutomationSurfaceActionSchema = z.lazy(() =>
  z
    .object({
      id: VarName,
      label: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
      icon: z.enum(ICON_NAMES).optional(),
      style: z.enum(["default", "primary", "danger"]).optional(),
      steps: z.array(AutomationStepSchema).min(1),
    })
    .strict(),
)

const ShowSurfaceStepSchema = z.lazy(() =>
  z.union([
    PassiveSurfaceStepSchema,
    EngineStepBaseSchema.extend({
      op: z.literal("showSurface"),
      surfaceId: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
      kind: z.literal("inline"),
      urlMatch: SurfaceUrlMatchSchema.optional(),
      placement: z
        .object({
          selector: z.string().min(1).max(2_000),
          index: z.number().int().min(0).max(1_000).optional(),
          position: z.enum(["before", "prepend", "append", "after"]),
        })
        .strict(),
      content: SurfaceContentSchema,
      actions: z
        .array(AutomationSurfaceActionSchema)
        .min(1)
        .max(5)
        .superRefine((actions, ctx) => {
          const ids = new Set<string>()
          actions.forEach((action, index) => {
            if (ids.has(action.id)) {
              ctx.addIssue({
                code: "custom",
                path: [index, "id"],
                message: `Duplicate action id "${action.id}"`,
              })
            }
            ids.add(action.id)
          })
        }),
    }).strict(),
  ]),
)

const JsonValueSchema: z.ZodType<JsonValue> = z
  .custom<JsonValue>()
  .superRefine((value, ctx) => {
    const result = inspectJsonValue(value)
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.error })
  })

const HttpRequestStepSchema: z.ZodType<HttpRequestStep> =
  EngineStepBaseSchema.extend({
    op: z.literal("httpRequest"),
    method: z.enum(HTTP_REQUEST_METHODS),
    url: z.string().min(1).max(2_000),
    headers: z
      .record(z.string(), z.string().max(HTTP_MAX_HEADER_VALUE_LENGTH))
      .optional(),
    body: JsonValueSchema.optional(),
    timeoutMs: z
      .number()
      .int()
      .min(HTTP_REQUEST_MIN_TIMEOUT_MS)
      .max(HTTP_REQUEST_MAX_TIMEOUT_MS)
      .optional(),
    response: z
      .object({
        statusToVar: VarName.optional(),
        json: z
          .array(
            z
              .object({
                path: z
                  .array(z.union([z.string(), z.number().int().nonnegative()]))
                  .min(1)
                  .max(10),
                toVar: VarName,
                required: z.boolean().optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
  })
    .strict()
    .superRefine((step, ctx) => {
      const endpoint = inspectHttpEndpoint(step.url)
      if (!endpoint.ok) {
        ctx.addIssue({ code: "custom", path: ["url"], message: endpoint.error })
      }
      if (step.method === "GET" && step.body !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["body"],
          message: "GET requests cannot have a body",
        })
      }
      const entries = Object.entries(step.headers ?? {})
      if (entries.length > HTTP_MAX_HEADERS) {
        ctx.addIssue({
          code: "custom",
          path: ["headers"],
          message: `Requests may define at most ${HTTP_MAX_HEADERS} headers`,
        })
      }
      const normalized = new Set<string>()
      entries.forEach(([name]) => {
        const error = validateHttpHeaderName(name)
        if (error)
          ctx.addIssue({
            code: "custom",
            path: ["headers", name],
            message: error,
          })
        const key = name.toLowerCase()
        if (normalized.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["headers", name],
            message: "Header names must be unique case-insensitively",
          })
        normalized.add(key)
      })
      const targets = new Set<string>()
      const responseTargets = [
        ...(step.response?.statusToVar ? [step.response.statusToVar] : []),
        ...(step.response?.json?.map((mapping) => mapping.toVar) ?? []),
      ]
      responseTargets.forEach((target) => {
        if (targets.has(target))
          ctx.addIssue({
            code: "custom",
            path: ["response"],
            message: `Duplicate response destination "${target}"`,
          })
        targets.add(target)
      })
    })

const HideSurfaceStepSchema = EngineStepBaseSchema.extend({
  op: z.literal("hideSurface"),
  surfaceId: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
}).strict()

export const AutomationStepSchema: z.ZodType<AutomationStep> = z.lazy(() =>
  z.union([
    AutomationClickStepSchema,
    AutomationSubmitStepSchema,
    WorkflowStepSchema,
    SetVariableStepSchema,
    InsertSnippetStepSchema,
    ToastStepSchema,
    NavigateEngineStepSchema,
    OpenUrlStepSchema,
    ClipboardWriteStepSchema,
    RunCommandStepSchema,
    HttpRequestStepSchema,
    ShowSurfaceStepSchema,
    HideSurfaceStepSchema,
    EngineStepBaseSchema.extend({
      op: z.literal("branch"),
      if: AutomationConditionSchema,
      then: z.array(AutomationStepSchema),
      else: z.array(AutomationStepSchema).optional(),
    }).strict(),
    EngineStepBaseSchema.extend({
      op: z.literal("forEach"),
      over: z.union([
        z.object({ elements: SelectorSchema }).strict(),
        z.object({ variable: VarName }).strict(),
      ]),
      as: VarName.optional(),
      maxIterations: z
        .number()
        .int()
        .min(1)
        .max(AUTOMATION_LOOP_MAX_ITERATIONS)
        .optional(),
      steps: z.array(AutomationStepSchema).min(1),
    }).strict(),
    EngineStepBaseSchema.extend({
      op: z.literal("while"),
      condition: AutomationConditionSchema,
      maxIterations: z
        .number()
        .int()
        .min(1)
        .max(AUTOMATION_LOOP_MAX_ITERATIONS)
        .optional(),
      steps: z.array(AutomationStepSchema).min(1),
    }).strict(),
  ]),
)

// ---------------------------------------------------------------------------
// Structural rules that need the whole document: total nested step count,
// control-flow depth, no navigation inside control-flow bodies (the
// segment-splitting complexity cliff), and per-type trigger uniqueness.

type StructuralIssue = { path: (string | number)[]; message: string }

const CONTROL_FLOW_OPS = new Set(["branch", "forEach", "while"])

const childStepArrays = (
  step: AutomationStep,
): Array<{ key: (string | number)[]; steps: AutomationStep[] }> => {
  if (step.op === "branch") {
    return [
      { key: ["then"], steps: step.then },
      ...(step.else ? [{ key: ["else"], steps: step.else }] : []),
    ]
  }
  if (step.op === "forEach" || step.op === "while") {
    return [{ key: ["steps"], steps: step.steps }]
  }
  if (step.op === "showSurface" && step.kind === "inline") {
    return step.actions.map((action, index) => ({
      key: ["actions", index, "steps"],
      steps: action.steps,
    }))
  }
  return []
}

/**
 * Walks the (already shape-validated) step tree and reports structural
 * violations. Exported for the engine's run-time re-check.
 */
export const collectStructuralIssues = (
  steps: AutomationStep[],
): StructuralIssue[] => {
  const issues: StructuralIssue[] = []
  let totalSteps = 0

  const walk = (
    list: AutomationStep[],
    depth: number,
    path: (string | number)[],
  ): void => {
    list.forEach((step, index) => {
      totalSteps += 1
      const stepPath = [...path, index]

      if (CONTROL_FLOW_OPS.has(step.op)) {
        if (depth + 1 > AUTOMATION_MAX_DEPTH) {
          issues.push({
            path: stepPath,
            message: `Control flow nests deeper than ${AUTOMATION_MAX_DEPTH} levels`,
          })
          return
        }

        for (const { key, steps: children } of childStepArrays(step)) {
          walk(children, depth + 1, [...stepPath, ...key])
        }
        return
      }

      if (
        depth > 0 &&
        (step.op === "navigate" ||
          (step.op === "openUrl" &&
            (step.disposition ?? "newTab") === "currentTab"))
      ) {
        // Navigation destroys the content context; inside loops/branches it
        // would force segment splitting mid-control-flow. Flat automations can
        // navigate freely.
        issues.push({
          path: stepPath,
          message: "Navigation steps are not allowed inside branches or loops",
        })
      }

      for (const { key, steps: children } of childStepArrays(step)) {
        walk(children, depth, [...stepPath, ...key])
      }
    })
  }

  walk(steps, 0, ["steps"])

  if (totalSteps > AUTOMATION_MAX_STEPS) {
    issues.push({
      path: ["steps"],
      message: `Automations may contain at most ${AUTOMATION_MAX_STEPS} steps (counting nested steps); found ${totalSteps}`,
    })
  }

  return issues
}

const applyStructuralChecks = (
  automation: {
    steps: AutomationStep[]
    triggers: Array<{ type: string }>
  },
  ctx: z.RefinementCtx,
): void => {
  for (const issue of collectStructuralIssues(automation.steps)) {
    ctx.addIssue({ code: "custom", message: issue.message, path: issue.path })
  }

  const nonManualCounts = new Map<string, number>()
  automation.triggers.forEach((trigger, index) => {
    if (trigger.type === "manual") {
      return
    }
    const count = (nonManualCounts.get(trigger.type) ?? 0) + 1
    nonManualCounts.set(trigger.type, count)
    if (count > 1) {
      ctx.addIssue({
        code: "custom",
        message: `At most one ${trigger.type} trigger per automation`,
        path: ["triggers", index],
      })
    }
  })
}

// ---------------------------------------------------------------------------
// The document schemas

const AutomationBaseShape = {
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
  description: z.string().max(AUTOMATION_STRING_MAX_LENGTH).optional(),
  icon: z.enum(ICON_NAMES).optional(),
  color: z.enum(COLOR_NAMES).optional(),
  enabled: z.boolean(),
  urlRules: z
    .object({
      allowUrls: z.array(BoundedString).max(100).optional(),
      denyUrls: z.array(BoundedString).max(100).optional(),
    })
    .strict()
    .optional(),
  triggers: z
    .array(AutomationTriggerSchema)
    .min(1, "An automation needs at least one trigger")
    .max(AUTOMATION_MAX_TRIGGERS),
  vars: z
    .record(VarName, AutomationVarDefSchema)
    .refine(
      (vars) => Object.keys(vars).length <= AUTOMATION_MAX_VARS,
      `At most ${AUTOMATION_MAX_VARS} variables per automation`,
    )
    .optional(),
  steps: z
    .array(AutomationStepSchema)
    .min(1, "An automation needs at least one step"),
  options: z
    .object({
      showResultToast: z.boolean().optional(),
    })
    .strict()
    .optional(),
  source: z
    .object({
      kind: z.enum(["local", "imported"]),
      importedAt: z.number().int().nonnegative().optional(),
    })
    .strict()
    .optional(),
  // Ownership tag. Optional so existing stored documents (which omit it)
  // validate unchanged; feature-projected documents set {kind:"feature"} so
  // they pass the engine's run-time re-validation under .strict(). User-owned
  // creation of feature-owned documents is blocked at the storage layer, not
  // here — the schema only needs to ACCEPT the shape.
  owner: z
    .union([
      z.object({ kind: z.literal("user") }).strict(),
      z
        .object({
          kind: z.literal("feature"),
          featureId: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
        })
        .strict(),
    ])
    .optional(),
}

/** Full stored document (storage validation, import). */
export const AutomationSchema = z
  .object({
    id: z.string().min(1).max(AUTOMATION_NAME_MAX_LENGTH),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    ...AutomationBaseShape,
  })
  .strict()
  .superRefine((automation, ctx) =>
    applyStructuralChecks(automation as unknown as Automation, ctx),
  )

/** Builder payload — storage assigns id and timestamps. */
export const AutomationDraftSchema = z
  .object(AutomationBaseShape)
  .strict()
  .superRefine((automation, ctx) =>
    applyStructuralChecks(
      automation as unknown as Omit<
        Automation,
        "id" | "createdAt" | "updatedAt"
      >,
      ctx,
    ),
  )

export type AutomationDraft = Omit<Automation, "id" | "createdAt" | "updatedAt">

export type AutomationValidationResult =
  | { success: true; automation: AutomationDraft }
  | { success: false; errors: Array<{ path: string; message: string }> }

/**
 * Validates a draft document (builder save, import after stripping
 * id/timestamps), returning field-level errors for inline display.
 */
export const validateAutomationDraft = (
  draft: unknown,
): AutomationValidationResult => {
  const result = AutomationDraftSchema.safeParse(draft)
  if (result.success) {
    return { success: true, automation: result.data as AutomationDraft }
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  }
}
