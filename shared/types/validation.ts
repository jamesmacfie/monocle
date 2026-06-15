// Architecture: shared/ validation layer. Zod schemas for every message
// crossing the UI -> background boundary, composed into the MessageSchema
// union consumed by background/utils/validation.ts. Workflow step schemas
// live in shared/types/workflowValidation.ts and user-script schemas in
// shared/types/userScriptValidation.ts; both are re-exported here so message
// handlers and tests keep one import surface.
import { z } from "zod"
import { SiteSdkRegistrationsSchema } from "./siteSdk"
import { UserScriptDraftSchema } from "./userScriptValidation"
import { WorkflowSchema } from "./workflowValidation"

export { WorkflowSchema, WorkflowStepSchema } from "./workflowValidation"

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

// User script messages. Drafts are validated with the full shared document
// schema (shared/types/userScriptValidation.ts) at this boundary — the
// options builder validates with the identical schema before sending.
export const GetUserScriptsMessageSchema = z.object({
  type: z.literal("get-user-scripts"),
})

export const AddUserScriptMessageSchema = z.object({
  type: z.literal("add-user-script"),
  script: UserScriptDraftSchema,
})

export const UpdateUserScriptMessageSchema = z.object({
  type: z.literal("update-user-script"),
  id: z.string().min(1, "User script ID cannot be empty"),
  script: UserScriptDraftSchema,
})

export const DeleteUserScriptMessageSchema = z.object({
  type: z.literal("delete-user-script"),
  id: z.string().min(1, "User script ID cannot be empty"),
})

export const RunUserScriptMessageSchema = z.object({
  type: z.literal("run-user-script"),
  id: z.string().min(1, "User script ID cannot be empty"),
  // Optional: options-page test runs have no page context; the engine then
  // targets the active tab.
  context: BrowserContextSchema.optional(),
  paramValues: z.record(z.string(), z.string()).optional(),
})

// Content -> background: the page reports its URL and receives the armed
// non-manual trigger specs whose script urlRules allow that URL.
export const GetUserScriptTriggersMessageSchema = z.object({
  type: z.literal("get-user-script-triggers"),
  url: z.string().min(1, "URL cannot be empty"),
})

// Content -> background: a page-side trigger (urlMatch/elementAppears)
// fired. The background re-validates eligibility, cooldowns, and the
// concurrent-run limit before executing anything.
export const UserScriptTriggerFiredMessageSchema = z.object({
  type: z.literal("user-script-trigger-fired"),
  scriptId: z.string().min(1, "User script ID cannot be empty"),
  trigger: z.object({
    type: z.enum(["urlMatch", "elementAppears"]),
    url: z.string().min(1, "URL cannot be empty"),
    matchedText: z.string().max(500).optional(),
  }),
})

// Feature-module messages. The config payload is validated structurally here;
// the per-feature configSchema re-validates it in the handler before persist.
export const GetFeaturesMessageSchema = z.object({
  type: z.literal("get-features"),
})

export const UpdateFeatureConfigMessageSchema = z.object({
  type: z.literal("update-feature-config"),
  featureId: z.string().min(1, "Feature ID cannot be empty"),
  config: z.record(z.string(), z.unknown()),
})

export const ExecuteFeatureActionMessageSchema = z.object({
  type: z.literal("execute-feature-action"),
  featureId: z.string().min(1, "Feature ID cannot be empty"),
  actionId: z.string().min(1, "Action ID cannot be empty"),
  context: BrowserContextSchema.optional(),
  payload: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
})

// Surfaces query.
export const GetSurfacesMessageSchema = z.object({
  type: z.literal("get-surfaces"),
  url: z.string(),
})

// The structured selection a `picker` surface reports on click. Free-text
// fields are bounded (attacker-facing — the page controls these values).
export const PickedElementSchema = z.object({
  selector: z.string().min(1).max(2000),
  tagName: z.string().min(1).max(64),
  id: z.string().max(256).optional(),
  classes: z.array(z.string().max(256)).max(50).optional(),
  innerText: z.string().max(2000).optional(),
  href: z.string().max(2000).optional(),
  role: z.string().max(64).optional(),
})

// A surface interaction (e.g. dismissing a modal, or a picker reporting a
// clicked element). See docs/v_next/03-surfaces-and-persistent-ui.md §3.
export const SurfaceActionMessageSchema = z.object({
  type: z.literal("surface-action"),
  ownerId: z.string().min(1, "Owner ID cannot be empty"),
  surfaceId: z.string().min(1, "Surface ID cannot be empty"),
  actionId: z.string().min(1, "Action ID cannot be empty"),
  value: z.string().optional(),
  selection: PickedElementSchema.optional(),
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
  GetUserScriptsMessageSchema,
  AddUserScriptMessageSchema,
  UpdateUserScriptMessageSchema,
  DeleteUserScriptMessageSchema,
  RunUserScriptMessageSchema,
  GetUserScriptTriggersMessageSchema,
  UserScriptTriggerFiredMessageSchema,
  GetFeaturesMessageSchema,
  UpdateFeatureConfigMessageSchema,
  ExecuteFeatureActionMessageSchema,
  GetSurfacesMessageSchema,
  SurfaceActionMessageSchema,
])

// Validation result types
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: z.ZodError["issues"] }

// Validation utility functions

/**
 * Parse an unknown inbound message against the whole MessageSchema union. This
 * is the message-boundary guard the background runs on every UI->background
 * message before dispatch; on failure it returns a flattened, human-readable
 * error rather than throwing. The thrown-error catch guards against
 * non-ZodError failures (e.g. a malformed schema).
 */
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

// Collapse a ZodError's issues into one "Validation failed: msg at path, ..."
// string. Used by every validator here so callers get a single error string
// (the structured `issues` array is also returned for callers that need it).
function formatValidationError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
    return `${issue.message}${path}`
  })

  return `Validation failed: ${issues.join(", ")}`
}

// Type-safe message validator that maintains TypeScript types

/**
 * Build a reusable validator bound to a single schema, returning a typed
 * ValidationResult. Used by individual background message handlers to validate
 * their specific payload (rather than the whole MessageSchema union), so the
 * narrowed `data` type flows through. Same flatten-and-never-throw contract as
 * validateMessage.
 */
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
