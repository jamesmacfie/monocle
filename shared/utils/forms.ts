// Architecture: shared/ helpers for inline command forms. The palette stores
// inline-input values as strings (or string[] for multi/text-list) in
// navigation page state, so these utilities normalize FormField defaults and
// validation to that representation. Used by CommandList (submit validation)
// and navigation.slice (seeding a new page's formValues). See
// docs/command-schema.md.
import type { FormField, Suggestion } from "../types"
import { validateWithJsonSchema } from "./validation"

/**
 * Default value for a field in the palette's string-based form-value space:
 * booleans become "true"/"false", multi/text-list become string[], numbers
 * become a string, everything else its string default (or "").
 */
export function getDefaultValue(field: FormField): string | string[] {
  switch (field.type) {
    case "text":
      return field.defaultValue || ""
    case "textarea":
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
    case "text-list":
      return field.defaultValue || []
    case "color":
      return field.defaultValue || "#000000"
    case "number":
      return field.defaultValue != null ? String(field.defaultValue) : ""
    default:
      return ""
  }
}

// Extract the FormField of every `input`-type row on a page — the page's form
// schema, used to seed defaults and validate on submit.
export function collectInputFieldsFromSuggestions(
  suggestions: Suggestion[],
): FormField[] {
  return suggestions
    .filter((s) => s.type === "input")
    .map((s) => (s as any).inputField as FormField)
}

// Build the initial `formValues` map for a freshly-opened page from its input
// rows' defaults. Called by navigation.slice when pushing/refreshing a page.
export function computeDefaultFormValues(
  suggestions: Suggestion[],
): Record<string, string | string[]> {
  const fields = collectInputFieldsFromSuggestions(suggestions)
  const entries = fields.map((field) => [field.id, getDefaultValue(field)])
  return Object.fromEntries(entries)
}

// Validate the current page's form values against its fields before a submit
// command runs (CommandList.handleSubmitForm). Enforces `required` and each
// field's JSON-Schema `validation`; multi/text-list values are joined to a
// comma string for the scalar schema check. Returns the list of failing field
// ids so the UI can surface them.
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
    } else if (field.type === "text-list") {
      const arr = Array.isArray(v)
        ? v
        : v
          ? String(v)
              .split(",")
              .map((entry) => entry.trim())
          : []
      const filtered = arr.filter((entry) => entry.trim().length > 0)
      if (field.required && filtered.length === 0) {
        invalid.push(field.id)
        continue
      }
      const res = validateWithJsonSchema(filtered.join(","), field.validation)
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
