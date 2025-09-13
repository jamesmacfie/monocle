import { z } from "zod"
import type { JSONSchema } from "../types/ui"

/**
 * Converts a JSON Schema to a Zod schema for validation
 * This allows us to send JSON Schema from background script and validate in content script
 */
export function jsonSchemaToZod(jsonSchema: JSONSchema): z.ZodSchema {
  // Apply enum validation first (overrides type)
  if (jsonSchema.enum && jsonSchema.enum.length > 0) {
    return z.enum(jsonSchema.enum as [string, ...string[]])
  }

  let schema: z.ZodSchema = (() => {
    switch (jsonSchema.type) {
      case "string":
        return z.string()
      case "number":
        return z.number()
      case "boolean":
        return z.boolean()
      case "integer":
        return z.number().int()
      default:
        return z.string() // Default to string for text inputs
    }
  })()

  // Apply string-specific validations
  if (jsonSchema.type === "string" || !jsonSchema.type) {
    let stringSchema = schema as z.ZodString
    if (jsonSchema.minLength !== undefined) {
      stringSchema = stringSchema.min(jsonSchema.minLength)
    }
    if (jsonSchema.maxLength !== undefined) {
      stringSchema = stringSchema.max(jsonSchema.maxLength)
    }
    if (jsonSchema.pattern) {
      stringSchema = stringSchema.regex(new RegExp(jsonSchema.pattern))
    }
    schema = stringSchema
  }

  // Apply number-specific validations
  if (jsonSchema.type === "number" || jsonSchema.type === "integer") {
    let numberSchema = schema as z.ZodNumber
    if (jsonSchema.minimum !== undefined) {
      numberSchema = numberSchema.min(jsonSchema.minimum)
    }
    if (jsonSchema.maximum !== undefined) {
      numberSchema = numberSchema.max(jsonSchema.maximum)
    }
    schema = numberSchema
  }

  return schema
}

/**
 * Validates a value against a JSON Schema
 */
export function validateWithJsonSchema(
  value: unknown,
  jsonSchema?: JSONSchema,
): {
  isValid: boolean
  error?: string
} {
  if (!jsonSchema) {
    return { isValid: true }
  }

  try {
    const zodSchema = jsonSchemaToZod(jsonSchema)
    zodSchema.parse(value)
    return { isValid: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        error: error.issues[0]?.message || "Validation failed",
      }
    }
    return {
      isValid: false,
      error: "Validation failed",
    }
  }
}
