// Architecture: pure, field-aware IR adapter. Nullable optionals are omitted,
// dynamic entry arrays become records, tagged HTTP JSON is decoded without
// losing an intentional null, and nested steps are normalized recursively.
// The result then crosses the shared untrusted-import + canonical Zod boundary.
import {
  type PreparedAutomationImport,
  prepareUntrustedAutomation,
} from "../../../shared/automations/import"
import type { JsonValue } from "../../../shared/types/automations"
import type { AutomationGenerationIr } from "./contract"
import { parseAutomationGenerationJsonNode } from "./contract"

export type NormalizedAutomationGeneration = PreparedAutomationImport

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const omitNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(omitNulls)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, omitNulls(child)]),
  )
}

const decodeJsonNode = (
  value: unknown,
  path: string,
  errors: string[],
): JsonValue | undefined => {
  const node = parseAutomationGenerationJsonNode(value)
  if (!node) {
    errors.push(`${path}: invalid tagged JSON value`)
    return undefined
  }
  switch (node.type) {
    case "null":
      return null
    case "string":
    case "number":
    case "boolean":
      return node.value
    case "array":
      return node.items.map((item, index) =>
        decodeJsonNode(item, `${path}.items.${index}`, errors),
      ) as JsonValue[]
    case "object": {
      const result: Record<string, JsonValue> = {}
      for (const [index, entry] of node.entries.entries()) {
        if (entry.key in result) {
          errors.push(`${path}.entries.${index}.key: duplicate JSON object key`)
          continue
        }
        const decoded = decodeJsonNode(
          entry.value,
          `${path}.entries.${index}.value`,
          errors,
        )
        if (decoded !== undefined) result[entry.key] = decoded
      }
      return result
    }
  }
}

const normalizeStep = (
  input: Record<string, unknown>,
  path: string,
  errors: string[],
): Record<string, unknown> => {
  // Clean nullable IR fields before decoding tagged JSON or replacing child
  // steps. A parent must never sweep already-normalized descendants because
  // intentional nulls in their decoded HTTP bodies are canonical data.
  const step = omitNulls(input) as Record<string, unknown>
  if (step.op === "httpRequest") {
    if (Array.isArray(step.headers)) {
      const headers: Record<string, string> = {}
      const normalizedNames = new Set<string>()
      step.headers.forEach((entry, index) => {
        if (
          !isRecord(entry) ||
          typeof entry.name !== "string" ||
          typeof entry.value !== "string"
        ) {
          errors.push(`${path}.headers.${index}: invalid header entry`)
          return
        }
        const normalizedName = entry.name.toLowerCase()
        if (normalizedNames.has(normalizedName)) {
          errors.push(`${path}.headers.${index}.name: duplicate header name`)
          return
        }
        normalizedNames.add(normalizedName)
        headers[entry.name] = entry.value
      })
      step.headers = headers
    }

    if ("body" in step) {
      const body = decodeJsonNode(step.body, `${path}.body`, errors)
      if (body !== undefined) step.body = body
    }
  }

  if (step.op === "branch") {
    if (Array.isArray(step.then)) {
      step.then = step.then.map((child, index) =>
        isRecord(child)
          ? normalizeStep(child, `${path}.then.${index}`, errors)
          : child,
      )
    }
    if (Array.isArray(step.else)) {
      step.else = step.else.map((child, index) =>
        isRecord(child)
          ? normalizeStep(child, `${path}.else.${index}`, errors)
          : child,
      )
    }
  }
  if (step.op === "forEach" || step.op === "while") {
    if (Array.isArray(step.steps)) {
      step.steps = step.steps.map((child, index) =>
        isRecord(child)
          ? normalizeStep(child, `${path}.steps.${index}`, errors)
          : child,
      )
    }
  }
  if (
    step.op === "showSurface" &&
    step.kind === "inline" &&
    Array.isArray(step.actions)
  ) {
    step.actions = step.actions.map((action, actionIndex) => {
      if (!isRecord(action) || !Array.isArray(action.steps)) return action
      return {
        ...action,
        steps: action.steps.map((child, index) =>
          isRecord(child)
            ? normalizeStep(
                child,
                `${path}.actions.${actionIndex}.steps.${index}`,
                errors,
              )
            : child,
        ),
      }
    })
  }
  return step
}

export const normalizeAutomationGeneration = (
  value: AutomationGenerationIr,
  now: () => number = Date.now,
): NormalizedAutomationGeneration => {
  const errors: string[] = []
  const vars: Record<string, unknown> = {}
  value.script.variables.forEach((variable, index) => {
    if (variable.name in vars) {
      errors.push(`variables.${index}.name: duplicate variable name`)
      return
    }
    vars[variable.name] = omitNulls(variable.definition)
  })

  const steps = value.script.steps.map((step, index) =>
    normalizeStep(step, `steps.${index}`, errors),
  )
  if (errors.length > 0) return { ok: false, errors }

  const script: Record<string, unknown> = {
    schemaVersion: value.script.schemaVersion,
    name: value.script.name,
    enabled: value.script.enabled,
    triggers: value.script.triggers.map(omitNulls),
    steps,
  }
  if (value.script.description !== null)
    script.description = value.script.description
  if (value.script.icon !== null) script.icon = value.script.icon
  if (value.script.color !== null) script.color = value.script.color
  if (value.script.urlRules !== null)
    script.urlRules = omitNulls(value.script.urlRules)
  if (Object.keys(vars).length > 0) script.vars = vars
  if (value.script.showResultToast !== null) {
    script.options = { showResultToast: value.script.showResultToast }
  }

  return prepareUntrustedAutomation({ script }, now)
}
