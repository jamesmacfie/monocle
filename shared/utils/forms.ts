import type { FormField, Suggestion } from "../types"
import { validateWithJsonSchema } from "./validation"

export function getDefaultValue(field: FormField): string | string[] {
  switch (field.type) {
    case "text":
      return field.defaultValue || ""
    case "select":
      return field.defaultValue || ""
    case "checkbox":
    case "switch":
      return field.defaultChecked ? "true" : "false"
    case "radio":
      return field.defaultValue || field.options?.[0]?.value || ""
    case "multi":
      return field.defaultValue || []
    case "color":
      return field.defaultValue || "#000000"
    default:
      return ""
  }
}

export function collectInputFieldsFromSuggestions(
  suggestions: Suggestion[],
): FormField[] {
  return suggestions
    .filter((s) => s.type === "input")
    .map((s) => (s as any).inputField as FormField)
}

export function computeDefaultFormValues(
  suggestions: Suggestion[],
): Record<string, string | string[]> {
  const fields = collectInputFieldsFromSuggestions(suggestions)
  const entries = fields.map((field) => [field.id, getDefaultValue(field)])
  return Object.fromEntries(entries)
}

export function validateFormValues(
  values: Record<string, string | string[] | undefined>,
  fields: FormField[],
): { isValid: boolean; error?: string; invalidFields?: string[] } {
  const invalid: string[] = []
  for (const field of fields) {
    const v = values[field.id]
    if (field.type === "multi") {
      const arr = Array.isArray(v) ? v : v ? String(v).split(",") : []
      if (field.required && arr.length === 0) {
        invalid.push(field.id)
        continue
      }
      const res = validateWithJsonSchema(arr.join(","), field.validation)
      if (!res.isValid) invalid.push(field.id)
    } else {
      const scalar = typeof v === "string" ? v : v ? String(v) : ""
      if (field.required && (!scalar || scalar.trim() === "")) {
        invalid.push(field.id)
        continue
      }
      const res = validateWithJsonSchema(scalar, field.validation)
      if (!res.isValid) invalid.push(field.id)
    }
  }
  return invalid.length
    ? { isValid: false, error: "Form is invalid", invalidFields: invalid }
    : { isValid: true }
}
