// Runtime validation schemas for message types
import { z } from "zod"

// Browser context validation schema
export const BrowserContextSchema = z.object({
  url: z.string().min(1, "URL cannot be empty"),
  title: z.string().min(1, "Title cannot be empty"),
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
})

export const ExecuteKeybindingMessageSchema = z.object({
  type: z.literal("execute-keybinding"),
  keybinding: z.string().min(1, "Keybinding cannot be empty"),
  context: BrowserContextSchema,
})

export const GetChildrenMessageSchema = z.object({
  type: z.literal("get-children-commands"),
  id: z.string().min(1, "Command ID cannot be empty"),
  context: BrowserContextSchema,
  parentPath: z.array(z.string()).optional(),
})

export const GetCommandsMessageSchema = z.object({
  type: z.literal("get-commands"),
  context: BrowserContextSchema,
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

export const UpdateCommandSettingMessageSchema = z.object({
  type: z.literal("update-command-setting"),
  commandId: z.string().min(1, "Command ID cannot be empty"),
  setting: z.string().min(1, "Setting name cannot be empty"),
  value: z.any(), // Allow any value type for settings
})

export const CheckKeybindingConflictMessageSchema = z.object({
  type: z.literal("check-keybinding-conflict"),
  keybinding: z.string().min(1, "Keybinding cannot be empty"),
  excludeCommandId: z.string().optional(),
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

// Union schema for all message types
export const MessageSchema = z.discriminatedUnion("type", [
  ExecuteCommandMessageSchema,
  ExecuteKeybindingMessageSchema,
  GetChildrenMessageSchema,
  GetCommandsMessageSchema,
  ShowToastMessageSchema,
  RequestToastMessageSchema,
  UpdateCommandSettingMessageSchema,
  CheckKeybindingConflictMessageSchema,
  GetUnsplashBackgroundMessageSchema,
  GetPermissionsMessageSchema,
  RequestPermissionMessageSchema,
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
