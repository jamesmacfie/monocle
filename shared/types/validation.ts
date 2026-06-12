// Runtime validation schemas for message types
import { z } from "zod"
import { SiteSdkRegistrationsSchema } from "./siteSdk"
import type { Selector } from "./workflow"

// Browser context validation schema
export const BrowserContextSchema = z.object({
  url: z.string().min(1, "URL cannot be empty"),
  title: z.string(),
  modifierKey: z.enum(["shift", "cmd", "alt", "ctrl"]).nullable(),
  isNewTab: z.boolean().optional(),
})

// Individual message schemas
export const ExecuteCommandMessageSchema = z.object({
  type: z.literal("execute-command"),
  id: z.string().min(1, "Command ID cannot be empty"),
  context: BrowserContextSchema,
  formValues: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
  parentNames: z.array(z.string()).optional(),
  executionScope: z
    .object({
      pageId: z.string().min(1, "Page ID cannot be empty"),
      parentPath: z.array(z.string()).optional(),
      searchValue: z.string().optional(),
    })
    .optional(),
})

export const ExecuteKeybindingMessageSchema = z.object({
  type: z.literal("execute-keybinding"),
  keybinding: z.string().min(1, "Keybinding cannot be empty"),
  context: BrowserContextSchema,
})

export const GetKeybindingStateMessageSchema = z.object({
  type: z.literal("get-keybinding-state"),
  context: BrowserContextSchema,
})

export const GetChildrenMessageSchema = z.object({
  type: z.literal("get-children-commands"),
  id: z.string().min(1, "Command ID cannot be empty"),
  context: BrowserContextSchema,
  parentPath: z.array(z.string()).optional(),
  searchValue: z.string().optional(),
})

export const GetCommandsMessageSchema = z.object({
  type: z.literal("get-commands"),
  context: BrowserContextSchema,
})

export const SearchCommandsMessageSchema = z.object({
  type: z.literal("search-commands"),
  context: BrowserContextSchema,
  query: z.string().max(1000, "Search query too long"),
  parentPath: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(200).optional(),
  seq: z.number().int().nonnegative(),
})

export const ShowToastMessageSchema = z.object({
  type: z.literal("show-toast"),
  level: z.enum(["info", "warning", "success", "error"]),
  message: z.string().min(1, "Toast message cannot be empty"),
})

export const RequestToastMessageSchema = z.object({
  type: z.literal("request-toast"),
  level: z.enum(["info", "warning", "success", "error"]),
  message: z.string().min(1, "Toast message cannot be empty"),
})

const CommandSettingBaseSchema = z.object({
  type: z.literal("update-command-setting"),
  commandId: z.string().min(1, "Command ID cannot be empty"),
  context: BrowserContextSchema.optional(),
})

const UrlRulesSettingValueSchema = z
  .object({
    allowUrls: z.array(z.string()).optional(),
    denyUrls: z.array(z.string()).optional(),
  })
  .strict()

export const UpdateCommandSettingMessageSchema = z.discriminatedUnion(
  "setting",
  [
    CommandSettingBaseSchema.extend({
      setting: z.literal("keybinding"),
      value: z.union([z.string(), z.null()]).optional(),
    }),
    CommandSettingBaseSchema.extend({
      setting: z.literal("urlRules"),
      value: UrlRulesSettingValueSchema,
    }),
    CommandSettingBaseSchema.extend({
      setting: z.literal("hidden"),
      value: z.boolean(),
    }),
  ],
)

export const UpdateCommandKeybindingsMessageSchema = z.object({
  type: z.literal("update-command-keybindings"),
  updates: z
    .array(
      z.object({
        commandId: z.string().min(1, "Command ID cannot be empty"),
        keybinding: z.union([z.string(), z.null()]).optional(),
      }),
    )
    .min(1, "At least one keybinding update is required")
    .max(500, "Too many keybinding updates"),
  context: BrowserContextSchema.optional(),
})

export const GetSettingsCatalogMessageSchema = z.object({
  type: z.literal("get-settings-catalog"),
  platform: z.enum(["chrome", "firefox"]).optional(),
})

export const SetCommandFavoriteMessageSchema = z.object({
  type: z.literal("set-command-favorite"),
  commandId: z.string().min(1, "Command ID cannot be empty"),
  favorite: z.boolean(),
})

const SnippetNameSchema = z
  .string()
  .min(1, "Snippet name cannot be empty")
  .max(200, "Snippet name too long")

const SnippetBodySchema = z
  .string()
  .min(1, "Snippet body cannot be empty")
  .max(100_000, "Snippet body too long")

export const GetSnippetsMessageSchema = z.object({
  type: z.literal("get-snippets"),
  context: BrowserContextSchema.optional(),
})

export const AddSnippetMessageSchema = z.object({
  type: z.literal("add-snippet"),
  name: SnippetNameSchema,
  body: SnippetBodySchema,
  context: BrowserContextSchema.optional(),
})

export const UpdateSnippetMessageSchema = z.object({
  type: z.literal("update-snippet"),
  id: z.string().min(1, "Snippet ID cannot be empty"),
  name: SnippetNameSchema.optional(),
  body: SnippetBodySchema.optional(),
  context: BrowserContextSchema.optional(),
})

export const DeleteSnippetMessageSchema = z.object({
  type: z.literal("delete-snippet"),
  id: z.string().min(1, "Snippet ID cannot be empty"),
  context: BrowserContextSchema.optional(),
})

export const CheckKeybindingConflictMessageSchema = z.object({
  type: z.literal("check-keybinding-conflict"),
  keybinding: z.string().min(1, "Keybinding cannot be empty"),
  excludeCommandId: z.string().optional(),
  context: BrowserContextSchema.optional(),
})

export const GetUnsplashBackgroundMessageSchema = z.object({
  type: z.literal("get-unsplash-background"),
  context: BrowserContextSchema,
})

export const GetPermissionsMessageSchema = z.object({
  type: z.literal("get-permissions"),
})

export const RequestPermissionMessageSchema = z.object({
  type: z.literal("request-permission"),
  permission: z.string().min(1, "Permission name cannot be empty"),
})

export const OpenPermissionGrantPageMessageSchema = z.object({
  type: z.literal("open-permission-grant-page"),
  permission: z.string().min(1, "Permission name cannot be empty"),
})

// Workflow schemas. This intentionally validates only the currently executable
// content-side subset; broader workflow types remain future design until their
// runtime behavior is implemented.
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

const SelectorSchema: z.ZodType<Selector> = z.lazy(() =>
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

export const WorkflowStepSchema = z.discriminatedUnion("op", [
  ClickStepSchema,
  WaitStepSchema,
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

export const ExecuteWorkflowMessageSchema = z.object({
  type: z.literal("execute-workflow"),
  workflow: WorkflowSchema,
  context: BrowserContextSchema,
  tabId: z.number().int().positive().optional(),
})

export const SiteSdkSyncMessageSchema = z.object({
  type: z.literal("site-sdk-sync"),
  context: BrowserContextSchema,
  registrations: SiteSdkRegistrationsSchema,
})

// Union schema for all message types
export const MessageSchema = z.discriminatedUnion("type", [
  ExecuteCommandMessageSchema,
  ExecuteKeybindingMessageSchema,
  GetKeybindingStateMessageSchema,
  GetChildrenMessageSchema,
  GetCommandsMessageSchema,
  SearchCommandsMessageSchema,
  ShowToastMessageSchema,
  RequestToastMessageSchema,
  UpdateCommandSettingMessageSchema,
  UpdateCommandKeybindingsMessageSchema,
  GetSettingsCatalogMessageSchema,
  SetCommandFavoriteMessageSchema,
  GetSnippetsMessageSchema,
  AddSnippetMessageSchema,
  UpdateSnippetMessageSchema,
  DeleteSnippetMessageSchema,
  CheckKeybindingConflictMessageSchema,
  GetUnsplashBackgroundMessageSchema,
  GetPermissionsMessageSchema,
  RequestPermissionMessageSchema,
  OpenPermissionGrantPageMessageSchema,
  ExecuteWorkflowMessageSchema,
  SiteSdkSyncMessageSchema,
])

// Validation result types
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: z.ZodError["issues"] }

// Validation utility functions
export function validateMessage(
  message: unknown,
): ValidationResult<z.infer<typeof MessageSchema>> {
  try {
    const result = MessageSchema.safeParse(message)
    if (result.success) {
      return { success: true, data: result.data }
    } else {
      return {
        success: false,
        error: formatValidationError(result.error),
        issues: result.error.issues,
      }
    }
  } catch (error) {
    return {
      success: false,
      error: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      issues: [],
    }
  }
}

export function validateBrowserContext(
  context: unknown,
): ValidationResult<z.infer<typeof BrowserContextSchema>> {
  try {
    const result = BrowserContextSchema.safeParse(context)
    if (result.success) {
      return { success: true, data: result.data }
    } else {
      return {
        success: false,
        error: formatValidationError(result.error),
        issues: result.error.issues,
      }
    }
  } catch (error) {
    return {
      success: false,
      error: `Context validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      issues: [],
    }
  }
}

// Helper function to format validation errors
function formatValidationError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
    return `${issue.message}${path}`
  })

  return `Validation failed: ${issues.join(", ")}`
}

// Type-safe message validator that maintains TypeScript types
export function createMessageValidator<T extends z.ZodSchema>(schema: T) {
  return (message: unknown): ValidationResult<z.infer<T>> => {
    try {
      const result = schema.safeParse(message)
      if (result.success) {
        return { success: true, data: result.data }
      } else {
        return {
          success: false,
          error: formatValidationError(result.error),
          issues: result.error.issues,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
        issues: [],
      }
    }
  }
}

// Export validated message types (for type safety in handlers)
export type ValidatedMessage = z.infer<typeof MessageSchema>
export type ValidatedBrowserContext = z.infer<typeof BrowserContextSchema>
