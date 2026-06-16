// Architecture: shared/ validation layer. Zod schemas for the workflow step
// vocabulary — the boundary half of the lockstep invariant
// (docs/workflow-automation.md): this union accepts exactly the operations
// content/workflow/executor.ts implements, so a workflow that validates can
// never reach an executor case that fails as unsupported. Used by the
// `execute-workflow` message schema (shared/types/validation.ts) and by the
// automation lowering tests. A new op lands here, in
// shared/types/workflow.ts, in the executor, and in tests as one change.
import { z } from "zod"
import type { Selector } from "./workflow"

const NonNegativeIntegerSchema = z.number().int().nonnegative()

const RetryPolicySchema = z
  .object({
    retries: NonNegativeIntegerSchema,
    delayMs: NonNegativeIntegerSchema.optional(),
    backoff: z.enum(["none", "exponential"]).optional(),
  })
  .strict()

const TargetingOptsSchema = z
  .object({
    scrollIntoView: z.boolean().optional(),
    ensureVisible: z.boolean().optional(),
  })
  .strict()

const BaseWorkflowStepSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  timeoutMs: NonNegativeIntegerSchema.optional(),
  retry: RetryPolicySchema.optional(),
  targeting: TargetingOptsSchema.optional(),
})

export const SelectorSchema: z.ZodType<Selector> = z.lazy(() =>
  z.discriminatedUnion("strategy", [
    z
      .object({
        strategy: z.literal("css"),
        value: z.string().min(1, "CSS selector cannot be empty"),
        index: NonNegativeIntegerSchema.optional(),
      })
      .strict(),
    z
      .object({
        strategy: z.literal("text"),
        value: z.string().min(1, "Text selector cannot be empty"),
        exact: z.boolean().optional(),
        within: SelectorSchema.optional(),
        index: NonNegativeIntegerSchema.optional(),
      })
      .strict(),
  ]),
)

const ClickStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("click"),
  target: SelectorSchema,
  button: z.enum(["left", "middle", "right"]).optional(),
  clickCount: z.union([z.literal(1), z.literal(2)]).optional(),
  delayMs: NonNegativeIntegerSchema.optional(),
  modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional(),
  // Automation-engine orchestration hint (see ClickStep in workflow.ts).
  expectNavigation: z.boolean().optional(),
}).strict()

const WaitForSchema = z.union([
  z
    .object({
      timeMs: NonNegativeIntegerSchema,
    })
    .strict(),
  z
    .object({
      selector: SelectorSchema,
      state: z.enum(["attached", "visible", "hidden", "detached"]).optional(),
    })
    .strict(),
  z
    .object({
      urlIncludes: z.string().min(1, "URL wait text cannot be empty"),
    })
    .strict(),
  z
    .object({
      readyState: z.enum(["loading", "interactive", "complete"]),
    })
    .strict(),
])

const WaitStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("wait"),
  for: WaitForSchema,
}).strict()

const HoverStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("hover"),
  target: SelectorSchema,
}).strict()

const FocusStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("focus"),
  target: SelectorSchema,
}).strict()

const BlurStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("blur"),
  target: SelectorSchema,
}).strict()

const FillStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("fill"),
  target: SelectorSchema,
  text: z.string(),
  clear: z.enum(["none", "select-all", "backspace"]).optional(),
  fire: z
    .object({
      input: z.boolean().optional(),
      change: z.boolean().optional(),
    })
    .strict()
    .optional(),
}).strict()

const TypeStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("type"),
  target: SelectorSchema,
  keys: z.array(z.string().min(1)).min(1, "Type step needs at least one key"),
  delayMs: NonNegativeIntegerSchema.optional(),
}).strict()

const KeyComboStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("key"),
  keys: z.array(z.string().min(1)).min(1, "Key step needs at least one key"),
  delayMs: NonNegativeIntegerSchema.optional(),
}).strict()

const SelectStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("select"),
  target: SelectorSchema,
  by: z
    .object({
      value: z.string().optional(),
      label: z.string().optional(),
      index: NonNegativeIntegerSchema.optional(),
    })
    .strict()
    .refine(
      (by) =>
        by.value !== undefined ||
        by.label !== undefined ||
        by.index !== undefined,
      "Select step needs a value, label, or index",
    ),
  fireChange: z.boolean().optional(),
}).strict()

const CheckStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("check"),
  target: SelectorSchema,
}).strict()

const UncheckStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("uncheck"),
  target: SelectorSchema,
}).strict()

const SubmitStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("submit"),
  target: SelectorSchema,
  // Automation-engine orchestration hint (see ClickStep in workflow.ts).
  expectNavigation: z.boolean().optional(),
}).strict()

const ScrollToSchema = z.union([
  z.literal("top"),
  z.literal("bottom"),
  z.literal("center"),
  z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .strict(),
  z
    .object({
      intoView: z.literal(true),
    })
    .strict(),
])

const ScrollStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("scroll"),
  target: SelectorSchema.optional(),
  to: ScrollToSchema,
  behavior: z.enum(["auto", "smooth"]).optional(),
}).strict()

const GetTextStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("getText"),
  from: SelectorSchema,
  attr: z.string().min(1).optional(),
  toVar: z.string().min(1, "getText needs a variable name"),
}).strict()

const RemoveElementStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("removeElement"),
  target: SelectorSchema,
  all: z.boolean().optional(),
}).strict()

const HideElementStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("hideElement"),
  target: SelectorSchema,
  all: z.boolean().optional(),
  scopeKey: z.string().min(1).max(200).optional(),
}).strict()

const InjectCssStepSchema = BaseWorkflowStepSchema.extend({
  op: z.literal("injectCss"),
  css: z.string().min(1, "CSS cannot be empty").max(10_000, "CSS too long"),
  scopeKey: z.string().min(1).max(200).optional(),
}).strict()

export const WorkflowStepSchema = z.discriminatedUnion("op", [
  ClickStepSchema,
  WaitStepSchema,
  HoverStepSchema,
  FocusStepSchema,
  BlurStepSchema,
  FillStepSchema,
  TypeStepSchema,
  KeyComboStepSchema,
  SelectStepSchema,
  CheckStepSchema,
  UncheckStepSchema,
  SubmitStepSchema,
  ScrollStepSchema,
  GetTextStepSchema,
  RemoveElementStepSchema,
  HideElementStepSchema,
  InjectCssStepSchema,
])

export const WorkflowSchema = z.object({
  version: z.literal("1.0"),
  name: z.string().optional(),
  vars: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .optional(),
  steps: z.array(WorkflowStepSchema),
})
