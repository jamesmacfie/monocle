// Runtime schemas for messages the background sends to a content/new-tab host.
//
// UI -> background messages are validated in shared/types/validation.ts before
// routing. This file is the mirror for the other direction: background -> tab
// messages that content listeners act on. Content hosts validate before side
// effects so the background continues to direct content by data documents only.
import { z } from "zod"
import { BrowserContextSchema } from "./validation"
import { WorkflowSchema } from "./workflowValidation"

const MessageTextSchema = z.string().min(1).max(100_000)

const ExecutionPayloadSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
)

const SiteSdkInvokeRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("execute"),
      callbackId: z.string().min(1).max(160),
      commandId: z.string().min(1).max(200),
      context: BrowserContextSchema,
      values: z.record(z.string(), z.string()),
      executionPayload: ExecutionPayloadSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("children"),
      callbackId: z.string().min(1).max(160),
      commandId: z.string().min(1).max(200),
      context: BrowserContextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("search"),
      callbackId: z.string().min(1).max(160),
      commandId: z.string().min(1).max(200),
      context: BrowserContextSchema,
      search: z.string().max(1000),
    })
    .strict(),
])

const PaletteControlMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("monocle-content-ping") }).strict(),
  z.object({ type: z.literal("monocle-ui-toggle") }).strict(),
  z.object({ type: z.literal("monocle-ui-show") }).strict(),
  z.object({ type: z.literal("monocle-ui-hide") }).strict(),
])

const ScrollMessageSchema = z
  .object({
    type: z.literal("monocle-scroll"),
    direction: z.enum(["top", "bottom"]).optional(),
    axis: z.enum(["x", "y"]).optional(),
    amount: z.number().optional(),
    unit: z.enum(["line", "viewport", "pixel"]).optional(),
    edge: z.enum(["start", "end"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasDirection = value.direction !== undefined
    const hasAmount =
      value.axis !== undefined &&
      value.amount !== undefined &&
      value.unit !== undefined
    const hasEdge = value.axis !== undefined && value.edge !== undefined
    if ([hasDirection, hasAmount, hasEdge].filter(Boolean).length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scroll message needs exactly one scroll shape",
      })
    }
  })

const MonocleEventMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("monocle-clipboard-write"),
      message: MessageTextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("monocle-text-insert"),
      text: MessageTextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("monocle-tab-open"),
      url: z.string().min(1).max(4000),
    })
    .strict(),
  ScrollMessageSchema,
  z
    .object({
      type: z.literal("monocle-screenshot"),
      mode: z.enum(["clipboard", "download"]),
      dataUrl: z.string().min(1).max(30_000_000),
      filename: z.string().min(1).max(255).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("monocle-toast"),
      level: z.enum(["info", "warning", "success", "error"]),
      message: z.string().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal("monocle-site-sdk-sync-request") }).strict(),
  z
    .object({
      type: z.literal("monocle-site-sdk-invoke"),
      request: SiteSdkInvokeRequestSchema,
    })
    .strict(),
  z.object({ type: z.literal("monocle-surfaces-changed") }).strict(),
])

export const ExecuteWorkflowContentMessageSchema = z
  .object({
    type: z.literal("monocle-workflow-content-execute"),
    workflow: WorkflowSchema,
    context: BrowserContextSchema,
  })
  .strict()

export const ContentMessageSchema = z.discriminatedUnion("type", [
  ...PaletteControlMessageSchema.options,
  ...MonocleEventMessageSchema.options,
  ExecuteWorkflowContentMessageSchema,
])

export type ContentMessage = z.infer<typeof ContentMessageSchema>
export type ExecuteWorkflowContentMessage = z.infer<
  typeof ExecuteWorkflowContentMessageSchema
>

export const validateContentMessage = (
  message: unknown,
): ContentMessage | null => {
  const result = ContentMessageSchema.safeParse(message)
  return result.success ? result.data : null
}
